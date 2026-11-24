/**
 * The learning engine's data and rules. Everything here is pure: state in, new state out.
 *
 * Two categories a puzzle can be added to (and removed from):
 *  - spaced repetition: only these puzzles ever come "due"
 *  - guided learning: the puzzle is trained in two special modes
 *      guided run   the player is given N "free" moves along a correct line, then solves the rest. Each clean
 *                   run reduces N, until a clean run with 0 free moves clears the guided stage.
 *      timed run  unlocked once guided is cleared: solve every line, scored in moves per minute.
 *    Both modes are limited to DAILY_LIMIT attempts per puzzle per day.
 */
import { type Attempt, type SelfRating, type SkillBar, SELF_SCORE, barColor, isDue } from './skill';

export type Category = 'spaced' | 'learning';
export type TimedLevel = 'none' | 'green' | 'gold' | 'diamond';

export const DAILY_LIMIT = 2;
export const MAX_BACKUPS = 15;
/** Timed score thresholds (moves per minute): strictly above. */
export const GREEN_ABOVE = 5;
export const GOLD_ABOVE = 10;
export const DIAMOND_ABOVE = 15;

export interface GuidedScore {
  /** free moves the next guided run will give */
  free: number;
  /** a clean run with 0 free moves has been completed */
  cleared: boolean;
  /** paper mode: how well the clearing run went (0..1, from the self-rating); missing means a full score */
  quality?: number;
}

export interface TimedResult {
  /** correct moves per minute, halved for every mistake */
  score: number;
  level: TimedLevel;
  /** correct clicks across the whole run */
  moves: number;
  mistakes: number;
  ms: number;
  /** how many lines had to be solved */
  lines: number;
  at: number;
}

export interface PuzzleLearning {
  guided?: GuidedScore;
  /** highest-scoring timed run; the level shown comes from this */
  best?: TimedResult;
  last?: TimedResult;
  runs?: number;
}

export interface LearningState {
  version: 1;
  spaced: Record<string, true>;
  learning: Record<string, true>;
  scores: Record<string, PuzzleLearning>;
  /** guided/timed attempts started per puzzle on a given local day */
  attempts: Record<string, { day: string; count: number }>;
}

export const emptyLearningState = (): LearningState => ({
  version: 1,
  spaced: {},
  learning: {},
  scores: {},
  attempts: {},
});

// ---------- categories ----------

export const inCategory = (s: LearningState, cat: Category, id: string) => s[cat][id] === true;

/** Add or remove a puzzle from a category. Removing keeps its scores, so re-adding resumes where it left off. */
export function setCategory(s: LearningState, cat: Category, id: string, on: boolean): LearningState {
  if (inCategory(s, cat, id) === on) return s;
  const next = { ...s[cat] };
  if (on) next[id] = true;
  else delete next[id];
  return { ...s, [cat]: next };
}

/** Add or remove several puzzles at once (a whole collection). Same rules as setCategory, one state change. */
export function setCategoryMany(s: LearningState, cat: Category, ids: string[], on: boolean): LearningState {
  return ids.reduce((acc, id) => setCategory(acc, cat, id, on), s);
}

/** Spaced repetition is the only way a puzzle comes due. */
export const isDueNow = (s: LearningState, id: string, history: Attempt[] | undefined, now = Date.now()) =>
  inCategory(s, 'spaced', id) && isDue(history, now);

export type LibraryFilter = 'all' | 'due' | 'spaced' | 'learning';

export function visibleIds(
  ids: string[],
  filter: LibraryFilter,
  s: LearningState,
  progress: Record<string, Attempt[]>,
  now = Date.now(),
): string[] {
  switch (filter) {
    case 'all':
      return ids;
    case 'due':
      return ids.filter((id) => isDueNow(s, id, progress[id], now));
    case 'spaced':
      return ids.filter((id) => inCategory(s, 'spaced', id));
    case 'learning':
      return ids.filter((id) => inCategory(s, 'learning', id));
  }
}

// ---------- guided stage ----------

/** Free moves at the start: everything but the last move. */
export const initialFree = (learnerMoves: number) => Math.max(0, learnerMoves - 1);

/** How many free moves each clean run removes: longer puzzles step down faster (about five stages). */
export const freeStep = (learnerMoves: number) => Math.max(1, Math.ceil(learnerMoves / 5));

/** The free-move counts a puzzle goes through, from the first guided run to the final 0. */
export function guidedStages(learnerMoves: number): number[] {
  const out = [initialFree(learnerMoves)];
  while (out[out.length - 1] > 0) out.push(Math.max(0, out[out.length - 1] - freeStep(learnerMoves)));
  return out;
}

/** Current guided progress. `learnerMoves` is the puzzle's length (see learnerDepth); it clamps stale data. */
export function guidedStatus(s: LearningState, id: string, learnerMoves: number): GuidedScore {
  const start = initialFree(learnerMoves);
  const g = s.scores[id]?.guided;
  return g ? { ...g, free: Math.min(g.free, start) } : { free: start, cleared: false };
}

/**
 * Record a finished guided run. A clean run steps the free moves down (a clean run at 0 clears the stage); a
 * run with any mistake changes nothing.
 *
 * Paper mode passes the player's self-rating. "Too tough" counts as not clean and, unlike a mistake, adds free moves
 * back (one step, up to the starting count). Any other rating is a clean run; the rating of the run that clears the
 * stage (at 0 free moves) sets the guided score.
 */
export function recordGuidedResult(
  s: LearningState,
  id: string,
  learnerMoves: number,
  correct: boolean,
  rating?: SelfRating,
): LearningState {
  const cur = guidedStatus(s, id, learnerMoves);
  if (cur.cleared) return s;
  if (rating === 'toohard' || (rating && !correct)) {
    const free = Math.min(initialFree(learnerMoves), cur.free + freeStep(learnerMoves));
    return { ...s, scores: { ...s.scores, [id]: { ...s.scores[id], guided: { free, cleared: false } } } };
  }
  if (!correct) return s;
  const guided: GuidedScore =
    cur.free === 0
      ? { free: 0, cleared: true, ...(rating ? { quality: SELF_SCORE[rating] } : {}) }
      : { free: Math.max(0, cur.free - freeStep(learnerMoves)), cleared: false };
  return { ...s, scores: { ...s.scores, [id]: { ...s.scores[id], guided } } };
}

/** Timed runs unlock when the guided stage is cleared. */
export const timedUnlocked = (s: LearningState, id: string) => s.scores[id]?.guided?.cleared === true;

// ---------- timed score ----------

/** Correct moves per minute, halved for each mistake. */
export function timedScore(r: { moves: number; ms: number; mistakes: number }): number {
  if (r.ms <= 0 || r.moves <= 0) return 0;
  return (r.moves / (r.ms / 60000)) * Math.pow(0.5, r.mistakes);
}

export function timedLevel(score: number): TimedLevel {
  if (score > DIAMOND_ABOVE) return 'diamond';
  if (score > GOLD_ABOVE) return 'gold';
  if (score > GREEN_ABOVE) return 'green';
  return 'none';
}

export function recordTimedResult(s: LearningState, id: string, r: TimedResult): LearningState {
  const cur = s.scores[id];
  const best = cur?.best && cur.best.score >= r.score ? cur.best : r;
  return { ...s, scores: { ...s.scores, [id]: { ...cur, best, last: r, runs: (cur?.runs ?? 0) + 1 } } };
}

/** How full a level's badge is, 0 to 1: empty until a level is earned, full at diamond. */
export const levelFill = (l: TimedLevel): number => ({ none: 0, green: 1 / 3, gold: 2 / 3, diamond: 1 })[l];

/**
 * A learning puzzle's progress as a bar: the first half fills as clean guided runs step the free moves down to zero,
 * the second half as the best timed score climbs to diamond. No numbers are shown.
 */
export function learningProgress(s: LearningState, id: string, learnerMoves: number): SkillBar {
  const g = guidedStatus(s, id, learnerMoves);
  const stages = guidedStages(learnerMoves);
  const done = g.cleared ? stages.length : Math.max(0, stages.indexOf(g.free));
  const best = s.scores[id]?.best?.score ?? 0;
  // the guided half is full unless a paper-mode self-rating cleared the stage with less; timed runs fill the rest
  const guidedHalf = 0.5 * (g.quality ?? 1);
  const timed = Math.min(1, Math.max(0, best) / DIAMOND_ABOVE);
  const fill = g.cleared ? guidedHalf + (1 - guidedHalf) * timed : 0.5 * (done / stages.length);
  return { fill, color: barColor(fill) };
}

/** The level a puzzle has earned (its best run). */
export const puzzleTimedLevel = (s: LearningState, id: string): TimedLevel => s.scores[id]?.best?.level ?? 'none';

// ---------- daily attempts ----------

/** Local calendar day, e.g. "2026-11-22". The limit resets at local midnight. */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function attemptsToday(s: LearningState, id: string, day: string): number {
  const a = s.attempts[id];
  return a && a.day === day ? a.count : 0;
}

export const attemptsLeft = (s: LearningState, id: string, day: string) =>
  Math.max(0, DAILY_LIMIT - attemptsToday(s, id, day));

/** Use one of today's attempts (guided and timed runs share the same two). */
export function recordAttemptStart(s: LearningState, id: string, day: string): LearningState {
  return { ...s, attempts: { ...s.attempts, [id]: { day, count: attemptsToday(s, id, day) + 1 } } };
}

// ---------- persistence: validation and backups ----------

export interface LearningBackup {
  at: number;
  state: LearningState;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate stored data. Returns null if it can't be used. Missing maps are filled in. */
export function parseLearningState(raw: unknown): LearningState | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const map = (v: unknown): Record<string, never> | null =>
    v === undefined ? {} : isRecord(v) ? (v as Record<string, never>) : null;
  const spaced = map(raw.spaced);
  const learning = map(raw.learning);
  const scores = map(raw.scores);
  const attempts = map(raw.attempts);
  if (!spaced || !learning || !scores || !attempts) return null;
  return { version: 1, spaced, learning, scores, attempts } as unknown as LearningState;
}

/** Add a backup, keeping only the most recent `keep` (oldest first in the list). */
export function pushBackup(
  backups: LearningBackup[],
  state: LearningState,
  at: number,
  keep = MAX_BACKUPS,
): LearningBackup[] {
  return [...backups, { at, state }].slice(-keep);
}

/** Usable backups from raw stored data, oldest first. Entries that fail validation are skipped. */
export function parseBackups(raw: unknown): LearningBackup[] {
  if (!Array.isArray(raw)) return [];
  const out: LearningBackup[] = [];
  for (const e of raw) {
    if (!isRecord(e) || typeof e.at !== 'number') continue;
    const state = parseLearningState(e.state);
    if (state) out.push({ at: e.at, state });
  }
  return out.sort((a, b) => a.at - b.at).slice(-MAX_BACKUPS);
}

/** What to load at startup: the saved state, or if that's missing or damaged, the newest usable backup. */
export function chooseStartupState(
  primary: unknown,
  backups: LearningBackup[],
): { state: LearningState; source: 'primary' | 'backup' | 'empty' } {
  const p = parseLearningState(primary);
  if (p) return { state: p, source: 'primary' };
  const newest = backups[backups.length - 1];
  return newest ? { state: newest.state, source: 'backup' } : { state: emptyLearningState(), source: 'empty' };
}
