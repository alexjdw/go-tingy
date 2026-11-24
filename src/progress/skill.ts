/**
 * Per-problem skill level from speed + accuracy.
 *
 *   red     slow and/or inaccurate
 *   yellow  getting there
 *   green   reliable
 *   silver  reliable and quick
 *   gold    mastered: consistently correct first try, at or under par time
 *
 * Only unguided attempts are recorded; guided play is for learning.
 */

export type Level = 'new' | 'red' | 'yellow' | 'green' | 'silver' | 'gold';

/** How a paper-mode attempt went, by the player's own judgment (best first). */
export type SelfRating = 'easy' | 'medium' | 'tough' | 'toohard';

export const SELF_RATINGS: readonly SelfRating[] = ['easy', 'medium', 'tough', 'toohard'];

export const SELF_LABEL: Record<SelfRating, string> = {
  easy: 'Easy',
  medium: 'Medium',
  tough: 'Tough',
  toohard: 'Too tough',
};

/** The worse (harder) of two ratings; a missing one counts for nothing. */
export function worseRating(a: SelfRating | undefined, b: SelfRating | undefined): SelfRating | undefined {
  if (!a || !b) return a ?? b;
  return SELF_RATINGS.indexOf(a) >= SELF_RATINGS.indexOf(b) ? a : b;
}

/** 0..1 value of a self-rating, for spaced repetition scores. "Too tough" counts as a failed attempt. */
export const SELF_SCORE: Record<SelfRating, number> = { easy: 1, medium: 0.8, tough: 0.5, toohard: 0 };

export interface Attempt {
  correct: boolean; // solved with zero mistakes (paper mode: not rated "too tough")
  ms: number;
  parMs: number;
  at: number; // epoch ms
  /** paper mode: the player's own rating, which replaces the speed score */
  self?: SelfRating;
}

/** Attempt history per problem id. */
export type ProgressMap = Record<string, Attempt[]>;

/** Append an attempt to a problem's history (returns a new map; keeps only the most recent `keep`). */
export function recordAttempt(map: ProgressMap, id: string, attempt: Attempt, keep = 50): ProgressMap {
  return { ...map, [id]: [...(map[id] ?? []), attempt].slice(-keep) };
}

const WINDOW = 10;

/** 0..1 quality of a single attempt. Wrong = 0; correct scores by speed relative to par. */
export function attemptScore(a: Attempt): number {
  if (a.self) return SELF_SCORE[a.self];
  if (!a.correct) return 0;
  const r = a.ms / a.parMs;
  if (r <= 1) return 1;
  if (r <= 2) return 0.8;
  if (r <= 4) return 0.55;
  return 0.45;
}

export interface Skill {
  level: Level;
  /** 0..1 blended score */
  score: number;
  accuracy: number;
  attempts: number;
}

export function computeSkill(history: Attempt[] | undefined): Skill {
  const h = (history ?? []).slice(-WINDOW);
  if (h.length === 0) return { level: 'new', score: 0, accuracy: 0, attempts: 0 };
  // recency-weighted: newest attempt weighs most
  let num = 0;
  let den = 0;
  h.forEach((a, i) => {
    const w = 1 + i * 0.5;
    num += w * attemptScore(a);
    den += w;
  });
  const score = num / den;
  const accuracy = h.filter((a) => a.correct).length / h.length;

  let level: Level;
  if (score < 0.4 || accuracy < 0.5) level = 'red';
  else if (score < 0.65) level = 'yellow';
  else if (score < 0.85) level = 'green';
  else if (score < 0.95) level = 'silver';
  else level = 'gold';

  // Learning tiers need enough evidence and recent perfection.
  const lastThree = h.slice(-3);
  const recentPerfect = lastThree.length === 3 && lastThree.every((a) => a.correct);
  if (level === 'gold' && !(h.length >= 5 && accuracy >= 0.9 && recentPerfect)) level = 'silver';
  if (level === 'silver' && !(h.length >= 3 && accuracy >= 0.8)) level = 'green';
  if (level === 'green' && h.length < 2) level = 'yellow';
  return { level, score, accuracy, attempts: h.length };
}

/** Days until a problem is due again, by level (simple spaced repetition). */
export const REVIEW_DAYS: Record<Level, number> = {
  new: 0,
  red: 0,
  yellow: 1,
  green: 3,
  silver: 7,
  gold: 21,
};

export function isDue(history: Attempt[] | undefined, now = Date.now()): boolean {
  const h = history ?? [];
  if (!h.length) return true;
  const { level } = computeSkill(h);
  return now - h[h.length - 1].at >= REVIEW_DAYS[level] * 86_400_000;
}

export const LEVEL_COLORS: Record<Level, string> = {
  new: '#8a8f98',
  red: '#e5484d',
  yellow: '#f5c518',
  green: '#30a46c',
  silver: '#c0c7d1',
  gold: '#e5a50a',
};

// ---------- the bar ----------

export interface SkillBar {
  /** 0..1: how full the bar is */
  fill: number;
  /** a color along red, yellow, green, gold: warmer when low, gold when full */
  color: string;
}

const STOPS: [number, string][] = [
  [0, LEVEL_COLORS.red],
  [0.3, LEVEL_COLORS.yellow],
  [0.6, LEVEL_COLORS.green],
  [1, LEVEL_COLORS.gold],
];

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/** The color of a bar that is `fill` full: a gradient through red, yellow and green to gold. */
export function barColor(fill: number): string {
  const f = Math.min(1, Math.max(0, fill));
  const hi = STOPS.findIndex(([at]) => f <= at);
  if (hi <= 0) return STOPS[0][1];
  const [a, ca] = STOPS[hi - 1];
  const [b, cb] = STOPS[hi];
  const t = (f - a) / (b - a);
  const mix = (i: number) =>
    Math.round(channel(ca, i) + (channel(cb, i) - channel(ca, i)) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}
