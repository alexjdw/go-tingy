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

export interface Attempt {
  correct: boolean; // solved with zero mistakes
  ms: number;
  parMs: number;
  at: number; // epoch ms
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

  // Mastery tiers need enough evidence and recent perfection.
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
