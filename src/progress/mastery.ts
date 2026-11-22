/**
 * The mastery engine's data and rules. Everything here is pure: state in, new state out.
 *
 * Two categories a puzzle can be added to (and removed from):
 *  - spaced repetition: only these puzzles ever come "due"
 *  - guided mastery: the puzzle is trained in two special modes
 *      guided run   the player is given N "free" moves along a correct line, then solves the rest. Each clean
 *                   run reduces N, until a clean run with 0 free moves clears the guided stage.
 *      mastery run  unlocked once guided is cleared: solve every line, scored in moves per minute.
 *    Both modes are limited to DAILY_LIMIT attempts per puzzle per day.
 */
import { type Attempt, type SkillBar, barColor, isDue } from './skill';

export type Category = 'spaced' | 'mastery';
export type MasteryLevel = 'none' | 'green' | 'gold' | 'diamond';

export const DAILY_LIMIT = 2;
export const MAX_BACKUPS = 15;
/** Mastery score thresholds (moves per minute): strictly above. */
export const GREEN_ABOVE = 5;
export const GOLD_ABOVE = 10;
export const DIAMOND_ABOVE = 15;

export interface GuidedScore {
  /** free moves the next guided run will give */
  free: number;
  /** a clean run with 0 free moves has been completed */
  cleared: boolean;
}

export interface MasteryResult {
  /** correct moves per minute, halved for every mistake */
  score: number;
  level: MasteryLevel;
  /** correct clicks across the whole run */
  moves: number;
  mistakes: number;
  ms: number;
  /** how many lines had to be solved */
  lines: number;
  at: number;
}

export interface PuzzleMastery {
  guided?: GuidedScore;
  /** highest-scoring mastery run; the mastery level shown comes from this */
  best?: MasteryResult;
  last?: MasteryResult;
  runs?: number;
}

export interface MasteryState {
  version: 1;
  spaced: Record<string, true>;
  mastery: Record<string, true>;
  scores: Record<string, PuzzleMastery>;
  /** guided/mastery attempts started per puzzle on a given local day */
  attempts: Record<string, { day: string; count: number }>;
}

export const emptyMasteryState = (): MasteryState => ({
  version: 1,
  spaced: {},
  mastery: {},
  scores: {},
  attempts: {},
});

// ---------- categories ----------

export const inCategory = (s: MasteryState, cat: Category, id: string) => s[cat][id] === true;

/** Add or remove a puzzle from a category. Removing keeps its scores, so re-adding resumes where it left off. */
export function setCategory(s: MasteryState, cat: Category, id: string, on: boolean): MasteryState {
  if (inCategory(s, cat, id) === on) return s;
  const next = { ...s[cat] };
  if (on) next[id] = true;
  else delete next[id];
  return { ...s, [cat]: next };
}

/** Spaced repetition is the only way a puzzle comes due. */
export const isDueNow = (s: MasteryState, id: string, history: Attempt[] | undefined, now = Date.now()) =>
  inCategory(s, 'spaced', id) && isDue(history, now);

export type LibraryFilter = 'all' | 'due' | 'spaced' | 'mastery';

export function visibleIds(
  ids: string[],
  filter: LibraryFilter,
  s: MasteryState,
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
    case 'mastery':
      return ids.filter((id) => inCategory(s, 'mastery', id));
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
export function guidedStatus(s: MasteryState, id: string, learnerMoves: number): GuidedScore {
  const start = initialFree(learnerMoves);
  const g = s.scores[id]?.guided;
  return g ? { free: Math.min(g.free, start), cleared: g.cleared } : { free: start, cleared: false };
}

/**
 * Record a finished guided run. A clean run steps the free moves down (a clean run at 0 clears the stage); a
 * run with any mistake changes nothing.
 */
export function recordGuidedResult(s: MasteryState, id: string, learnerMoves: number, correct: boolean): MasteryState {
  if (!correct) return s;
  const cur = guidedStatus(s, id, learnerMoves);
  if (cur.cleared) return s;
  const guided: GuidedScore =
    cur.free === 0
      ? { free: 0, cleared: true }
      : { free: Math.max(0, cur.free - freeStep(learnerMoves)), cleared: false };
  return { ...s, scores: { ...s.scores, [id]: { ...s.scores[id], guided } } };
}

/** Mastery runs unlock when the guided stage is cleared. */
export const masteryUnlocked = (s: MasteryState, id: string) => s.scores[id]?.guided?.cleared === true;

// ---------- mastery score ----------

/** Correct moves per minute, halved for each mistake. */
export function masteryScore(r: { moves: number; ms: number; mistakes: number }): number {
  if (r.ms <= 0 || r.moves <= 0) return 0;
  return (r.moves / (r.ms / 60000)) * Math.pow(0.5, r.mistakes);
}

export function masteryLevel(score: number): MasteryLevel {
  if (score > DIAMOND_ABOVE) return 'diamond';
  if (score > GOLD_ABOVE) return 'gold';
  if (score > GREEN_ABOVE) return 'green';
  return 'none';
}

export function recordMasteryResult(s: MasteryState, id: string, r: MasteryResult): MasteryState {
  const cur = s.scores[id];
  const best = cur?.best && cur.best.score >= r.score ? cur.best : r;
  return { ...s, scores: { ...s.scores, [id]: { ...cur, best, last: r, runs: (cur?.runs ?? 0) + 1 } } };
}

/** How full a level's badge is, 0 to 1: empty until a level is earned, full at diamond. */
export const levelFill = (l: MasteryLevel): number => ({ none: 0, green: 1 / 3, gold: 2 / 3, diamond: 1 })[l];

/**
 * A mastery puzzle's progress as a bar: the first half fills as clean guided runs step the free moves down to zero,
 * the second half as the best mastery score climbs to diamond. No numbers are shown.
 */
export function masteryProgress(s: MasteryState, id: string, learnerMoves: number): SkillBar {
  const g = guidedStatus(s, id, learnerMoves);
  const stages = guidedStages(learnerMoves);
  const done = g.cleared ? stages.length : Math.max(0, stages.indexOf(g.free));
  const best = s.scores[id]?.best?.score ?? 0;
  const fill = g.cleared ? 0.5 + 0.5 * Math.min(1, Math.max(0, best) / DIAMOND_ABOVE) : 0.5 * (done / stages.length);
  return { fill, color: barColor(fill) };
}

/** The level a puzzle has earned (its best run). */
export const puzzleMasteryLevel = (s: MasteryState, id: string): MasteryLevel => s.scores[id]?.best?.level ?? 'none';

// ---------- daily attempts ----------

/** Local calendar day, e.g. "2026-11-22". The limit resets at local midnight. */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function attemptsToday(s: MasteryState, id: string, day: string): number {
  const a = s.attempts[id];
  return a && a.day === day ? a.count : 0;
}

export const attemptsLeft = (s: MasteryState, id: string, day: string) =>
  Math.max(0, DAILY_LIMIT - attemptsToday(s, id, day));

/** Use one of today's attempts (guided and mastery runs share the same two). */
export function recordAttemptStart(s: MasteryState, id: string, day: string): MasteryState {
  return { ...s, attempts: { ...s.attempts, [id]: { day, count: attemptsToday(s, id, day) + 1 } } };
}

// ---------- persistence: validation and backups ----------

export interface MasteryBackup {
  at: number;
  state: MasteryState;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate stored data. Returns null if it can't be used. Missing maps are filled in. */
export function parseMasteryState(raw: unknown): MasteryState | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const map = (v: unknown): Record<string, never> | null =>
    v === undefined ? {} : isRecord(v) ? (v as Record<string, never>) : null;
  const spaced = map(raw.spaced);
  const mastery = map(raw.mastery);
  const scores = map(raw.scores);
  const attempts = map(raw.attempts);
  if (!spaced || !mastery || !scores || !attempts) return null;
  return { version: 1, spaced, mastery, scores, attempts } as unknown as MasteryState;
}

/** Add a backup, keeping only the most recent `keep` (oldest first in the list). */
export function pushBackup(
  backups: MasteryBackup[],
  state: MasteryState,
  at: number,
  keep = MAX_BACKUPS,
): MasteryBackup[] {
  return [...backups, { at, state }].slice(-keep);
}

/** Usable backups from raw stored data, oldest first. Entries that fail validation are skipped. */
export function parseBackups(raw: unknown): MasteryBackup[] {
  if (!Array.isArray(raw)) return [];
  const out: MasteryBackup[] = [];
  for (const e of raw) {
    if (!isRecord(e) || typeof e.at !== 'number') continue;
    const state = parseMasteryState(e.state);
    if (state) out.push({ at: e.at, state });
  }
  return out.sort((a, b) => a.at - b.at).slice(-MAX_BACKUPS);
}

/** What to load at startup: the saved state, or if that's missing or damaged, the newest usable backup. */
export function chooseStartupState(
  primary: unknown,
  backups: MasteryBackup[],
): { state: MasteryState; source: 'primary' | 'backup' | 'empty' } {
  const p = parseMasteryState(primary);
  if (p) return { state: p, source: 'primary' };
  const newest = backups[backups.length - 1];
  return newest ? { state: newest.state, source: 'backup' } : { state: emptyMasteryState(), source: 'empty' };
}
