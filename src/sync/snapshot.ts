import type { Problem } from '../data/samples';
import type { LearningState, PuzzleLearning } from '../progress/learning';
import type { Attempt, ProgressMap } from '../progress/skill';
import type { Settings } from '../storage/settings';

/** Most attempts kept per puzzle, as in `recordAttempt`. */
const KEEP_ATTEMPTS = 50;

/**
 * Everything that is synced between a player's devices, in one JSON document.
 * The built-in sample puzzles are not part of it (every install has them).
 */
export interface Snapshot {
  version: 1;
  /** when this device last changed anything in it, epoch ms; the newer snapshot wins where a merge cannot combine */
  updatedAt: number;
  library: Problem[];
  /** puzzle id -> when it was deleted; a deleted puzzle stays deleted on every device */
  deleted: Record<string, number>;
  progress: ProgressMap;
  joseki: string[];
  learning: LearningState;
  settings: Settings;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A snapshot read from text (a file in the cloud): null if it is damaged or from a newer version of the app. */
export function parseSnapshot(text: string): Snapshot | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(v) || v.version !== 1 || typeof v.updatedAt !== 'number') return null;
  if (!Array.isArray(v.library) || !Array.isArray(v.joseki)) return null;
  if (!isObj(v.deleted) || !isObj(v.progress) || !isObj(v.learning) || !isObj(v.settings)) return null;
  const library = v.library.filter(
    (p): p is Problem =>
      isObj(p) && typeof p.id === 'string' && typeof p.sgf === 'string' && typeof p.title === 'string',
  );
  return {
    version: 1,
    updatedAt: v.updatedAt,
    library,
    deleted: v.deleted as Record<string, number>,
    progress: v.progress as ProgressMap,
    joseki: v.joseki.filter((x): x is string => typeof x === 'string'),
    learning: v.learning as unknown as LearningState,
    settings: v.settings as unknown as Settings,
  };
}

export const stringifySnapshot = (s: Snapshot) => JSON.stringify(s);

/** The content as text, ignoring updatedAt and the order of lists: two snapshots with the same key are the same data. */
export const contentKey = (s: Snapshot): string => JSON.stringify(canonical(s));

/** Same content, ignoring the order puzzles and ids were listed in (and updatedAt). */
export const sameContent = (a: Snapshot, b: Snapshot): boolean => contentKey(a) === contentKey(b);

function canonical(s: Snapshot): unknown {
  const sortKeys = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
  return {
    library: [...s.library].sort((x, y) => (x.id < y.id ? -1 : 1)),
    deleted: sortKeys(s.deleted),
    progress: sortKeys(s.progress),
    joseki: [...s.joseki].sort(),
    learning: {
      spaced: sortKeys(s.learning.spaced),
      learning: sortKeys(s.learning.learning),
      scores: sortKeys(s.learning.scores),
      attempts: sortKeys(s.learning.attempts),
      priority: sortKeys(s.learning.priority ?? {}),
    },
    settings: sortKeys(s.settings as unknown as Record<string, unknown>),
  };
}

/** Both devices' attempts for one puzzle, once each, oldest first, the most recent KEEP_ATTEMPTS. */
function mergeAttempts(a: Attempt[] = [], b: Attempt[] = []): Attempt[] {
  const seen = new Set<string>();
  const out: Attempt[] = [];
  for (const x of [...a, ...b]) {
    const key = `${x.at}:${x.ms}:${x.correct ? 1 : 0}:${x.self ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out.sort((x, y) => x.at - y.at).slice(-KEEP_ATTEMPTS);
}

/** Per puzzle, the learning record that has been practiced more; a tie goes to `preferred`. */
function mergeScores(
  preferred: Record<string, PuzzleLearning>,
  other: Record<string, PuzzleLearning>,
): Record<string, PuzzleLearning> {
  const out: Record<string, PuzzleLearning> = { ...other };
  for (const [id, s] of Object.entries(preferred)) {
    const o = other[id];
    out[id] = !o || (s.runs ?? 0) >= (o.runs ?? 0) ? s : o;
  }
  return out;
}

/** The daily attempt counters: the later day wins; on the same day the larger count. */
function mergeDaily(preferred: LearningState['attempts'], other: LearningState['attempts']): LearningState['attempts'] {
  const out = { ...other };
  for (const [id, d] of Object.entries(preferred)) {
    const o = other[id];
    if (!o || d.day > o.day || (d.day === o.day && d.count >= o.count)) out[id] = d;
  }
  return out;
}

/**
 * Combine two devices' snapshots into one that neither loses anything from, except where the two disagree about a
 * setting-like value (the joseki list, which puzzles are in a learning list, settings): there the newer snapshot wins.
 *  - puzzles: all of them, by id; a deleted puzzle stays deleted; if both changed one, the newer snapshot's copy wins
 *  - attempts: all of them, once each
 *  - learning scores: the more practiced record per puzzle
 *
 * `first` is for a device that has never synced (so its "newer" stamp only means "not synced yet"): then nothing of
 * the cloud's is dropped. The study lists and the joseki list are the union of both, and the cloud's settings win.
 */
export function mergeSnapshots(a: Snapshot, b: Snapshot, opts: { first?: boolean } = {}): Snapshot {
  const [older, newer] = a.updatedAt > b.updatedAt ? [b, a] : [a, b]; // a tie goes to `b` (the cloud copy)
  const deleted: Record<string, number> = { ...older.deleted };
  for (const [id, t] of Object.entries(newer.deleted)) deleted[id] = Math.max(t, deleted[id] ?? 0);

  const byId = new Map<string, Problem>();
  for (const p of [...older.library, ...newer.library]) if (!deleted[p.id]) byId.set(p.id, p);

  const progress: ProgressMap = {};
  for (const id of new Set([...Object.keys(older.progress), ...Object.keys(newer.progress)])) {
    if (deleted[id]) continue;
    progress[id] = mergeAttempts(older.progress[id], newer.progress[id]);
  }

  const alive = (id: string) => !deleted[id];
  const only = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([id]) => alive(id)));
  const learning: LearningState = {
    version: 1,
    spaced: only(opts.first ? { ...a.learning.spaced, ...b.learning.spaced } : newer.learning.spaced),
    learning: only(opts.first ? { ...a.learning.learning, ...b.learning.learning } : newer.learning.learning),
    scores: only(mergeScores(newer.learning.scores, older.learning.scores)),
    attempts: only(mergeDaily(newer.learning.attempts, older.learning.attempts)),
  };
  // priorities from both devices are kept, the later end date winning
  const priority: Record<string, number> = {};
  for (const src of [older.learning.priority, newer.learning.priority])
    for (const [id, end] of Object.entries(src ?? {})) if (alive(id)) priority[id] = Math.max(end, priority[id] ?? 0);
  if (Object.keys(priority).length) learning.priority = priority;

  return {
    version: 1,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    library: [...byId.values()],
    deleted,
    progress,
    joseki: (opts.first ? [...new Set([...a.joseki, ...b.joseki])] : newer.joseki).filter(alive),
    learning,
    settings: opts.first ? { ...a.settings, ...b.settings } : { ...older.settings, ...newer.settings },
  };
}
