/**
 * Working through a backlog without being overwhelmed: the player picks a few puzzles and a number of days, and those
 * puzzles are "priority" until the days are over (first in the guided list, first when due in spaced repetition).
 * Also: auto-mode helpers live in `src/study/auto.ts`; moving a diamond puzzle on to spaced repetition is here.
 * Everything is pure.
 */
import { type LearningState, inCategory, learningProgress } from './learning';
import { type Attempt, type ProgressMap, computeSkill } from './skill';

export const DAY_MS = 86_400_000;
export const DEFAULT_BACKLOG_COUNT = 5;
export const DEFAULT_BACKLOG_DAYS = 7;
export const MAX_BACKLOG_COUNT = 200;
export const MAX_BACKLOG_DAYS = 365;

/** A whole number from typed text, kept within bounds; `fallback` when it isn't a number. */
export function clampWhole(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// ---------- priority ----------

/** Is the puzzle a priority right now? */
export const isPriority = (s: LearningState, id: string, now = Date.now()) => (s.priority?.[id] ?? 0) > now;

/** Whole days left of a priority (at least 1 while it lasts), or 0 when it is not a priority. */
export function priorityDaysLeft(s: LearningState, id: string, now = Date.now()): number {
  const end = s.priority?.[id] ?? 0;
  return end > now ? Math.ceil((end - now) / DAY_MS) : 0;
}

/** Make these puzzles a priority for `days` days from now. Priorities that have ended are dropped. */
export function setPriority(s: LearningState, ids: readonly string[], days: number, now = Date.now()): LearningState {
  const priority: Record<string, number> = {};
  for (const [id, end] of Object.entries(s.priority ?? {})) if (end > now) priority[id] = end;
  for (const id of ids) priority[id] = now + days * DAY_MS;
  return { ...s, priority };
}

/** Ids with the priority ones first; both groups keep their order. */
export function priorityFirst<T extends { id: string }>(items: readonly T[], s: LearningState, now = Date.now()): T[] {
  if (!s.priority) return [...items];
  return [...items.filter((p) => isPriority(s, p.id, now)), ...items.filter((p) => !isPriority(s, p.id, now))];
}

// ---------- choosing puzzles ----------

export interface Candidate {
  id: string;
  /** the puzzle's length for the learner (`cachedLearnerDepth`) */
  learnerMoves: number;
}

/**
 * How well a puzzle is known, 0 (not at all) to 1: the average of its guided-learning progress (if it is in guided
 * learning) and its spaced-repetition score (if it is in spaced repetition). A puzzle in neither scores 0.
 */
export function backlogScore(s: LearningState, progress: ProgressMap, c: Candidate): number {
  const parts: number[] = [];
  if (inCategory(s, 'learning', c.id)) parts.push(learningProgress(s, c.id, c.learnerMoves).fill);
  if (inCategory(s, 'spaced', c.id)) parts.push(computeSkill(progress[c.id]).score);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
}

/**
 * The puzzles the player can choose from: those in guided learning or spaced repetition that are not already a
 * priority, lowest score first (so the ones that need the most work come first). Ties keep the library order.
 */
export function backlogCandidates(
  all: readonly Candidate[],
  s: LearningState,
  progress: ProgressMap,
  now = Date.now(),
): Candidate[] {
  return all
    .filter((c) => (inCategory(s, 'learning', c.id) || inCategory(s, 'spaced', c.id)) && !isPriority(s, c.id, now))
    .map((c, i) => ({ c, i, score: backlogScore(s, progress, c) }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.c);
}

// ---------- diamond -> spaced repetition ----------

/** Perfect attempts to add: enough to fill the whole scoring window (10), so earlier misses no longer count. */
const MASTERY_ATTEMPTS = 10;

/**
 * Give a puzzle the history of a mastered one (ten clean, on-par attempts, so it reads as gold and next comes due in
 * three weeks). Used when a diamond puzzle is moved to spaced repetition; the real attempts are kept before them.
 */
export function seedMastery(progress: ProgressMap, id: string, now = Date.now()): ProgressMap {
  const fake: Attempt[] = Array.from({ length: MASTERY_ATTEMPTS }, (_, i) => ({
    correct: true,
    ms: 1000,
    parMs: 1000,
    at: now - (MASTERY_ATTEMPTS - 1 - i) * 1000,
  }));
  return { ...progress, [id]: [...(progress[id] ?? []), ...fake].slice(-50) };
}

/**
 * A guided-learning puzzle reached diamond and the player moves it on: it leaves guided learning (its scores are
 * kept) and joins spaced repetition. If it was not in spaced repetition yet, its spaced score is set high; if it
 * already was, its spaced history is left alone.
 */
export function graduateToSpaced(
  s: LearningState,
  progress: ProgressMap,
  id: string,
  now = Date.now(),
): { learning: LearningState; progress: ProgressMap } {
  const wasSpaced = inCategory(s, 'spaced', id);
  const spaced = { ...s.spaced, [id]: true as const };
  const learning = { ...s.learning };
  delete learning[id];
  return {
    learning: { ...s, spaced, learning },
    progress: wasSpaced ? progress : seedMastery(progress, id, now),
  };
}
