/**
 * Auto mode for guided learning: the player says how many puzzles to do; the app picks that many (random inside each
 * level, lowest level first, never a diamond one) and moves on to the next puzzle by itself once a puzzle's daily
 * attempts are used up. Pure logic.
 */
import { type LearningState, type SkillMark, attemptsLeft, skillMark } from '../progress/learning';
import { shuffle } from './session';

/** Lowest mastery first. Diamond puzzles are never picked. */
export const AUTO_ORDER: readonly SkillMark[] = ['red', 'yellow', 'green', 'sparkle'];

export const DEFAULT_AUTO_COUNT = 5;

export interface AutoItem {
  id: string;
  learnerMoves: number;
}

/** Can auto mode play this puzzle today: it has a line to solve, an attempt left and is not a diamond puzzle. */
export const autoPlayable = (s: LearningState, it: AutoItem, day: string) =>
  it.learnerMoves > 0 && attemptsLeft(s, it.id, day) > 0 && skillMark(s, it.id, it.learnerMoves) !== 'diamond';

/**
 * `count` puzzles in increasing order of mastery: all the red ones (in random order) before any yellow one, and so on.
 * Only puzzles that can be played today are considered.
 */
export function pickAutoIds(
  items: readonly AutoItem[],
  s: LearningState,
  day: string,
  count: number,
  rng: () => number = Math.random,
): string[] {
  const ok = items.filter((it) => autoPlayable(s, it, day));
  const out: string[] = [];
  for (const mark of AUTO_ORDER) {
    const tier = ok.filter((it) => skillMark(s, it.id, it.learnerMoves) === mark);
    for (const it of shuffle(tier, rng)) {
      if (out.length >= count) return out;
      out.push(it.id);
    }
  }
  return out;
}

/**
 * Where auto mode is: the chosen ids, the one being played, and how many attempts it had left when its run was opened
 * (so that backing out of a run without playing ends auto mode instead of reopening the same puzzle).
 */
export interface AutoPlan {
  ids: string[];
  index: number;
  leftAtOpen: number;
}

/**
 * The next puzzle auto mode should open, at or after `from`: the first one that can still be played today. Null when
 * the list is used up.
 */
export function nextAutoIndex(
  plan: Pick<AutoPlan, 'ids'>,
  from: number,
  s: LearningState,
  items: ReadonlyMap<string, AutoItem>,
  day: string,
): number | null {
  for (let i = from; i < plan.ids.length; i++) {
    const it = items.get(plan.ids[i]);
    if (it && autoPlayable(s, it, day)) return i;
  }
  return null;
}
