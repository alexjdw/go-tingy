/**
 * What the study modes offer for a puzzle, decided from its progress: pure helpers behind the tile buttons.
 */
import { type LearningState, attemptsLeft, guidedStages, guidedStatus, puzzleTimedLevel } from './learning';
import { type Attempt, type Level, computeSkill } from './skill';

export type RunKind = 'guided' | 'learning';

export interface LearningAction {
  /** which run Play starts; null when none is available right now */
  kind: RunKind | null;
  /** the text for the Play button */
  label: string;
  /** a line under the tile: where this puzzle stands */
  caption: string;
  enabled: boolean;
}

/**
 * What "Play" does for a puzzle in learning mode: the next step of its training. A puzzle whose guided stage is not
 * cleared gets a guided run; once it is cleared, Play starts a timed run. Two attempts a day, shared.
 */
export function learningAction(s: LearningState, id: string, learnerMoves: number, day: string): LearningAction {
  if (learnerMoves <= 0) return { kind: null, label: 'Play', caption: 'No solution line', enabled: false };
  const g = guidedStatus(s, id, learnerMoves);
  const best = s.scores[id]?.best;
  const left = attemptsLeft(s, id, day);
  const stages = guidedStages(learnerMoves);
  const stage = Math.max(0, stages.indexOf(g.free)) + 1;
  const caption = g.cleared
    ? best
      ? `Best: ${puzzleTimedLevel(s, id)} · ${best.score.toFixed(1)}`
      : 'Guided cleared · ready for timed runs'
    : `Guided: stage ${stage} of ${stages.length} · ${g.free} free move${g.free === 1 ? '' : 's'}`;
  if (left === 0)
    return { kind: null, label: 'Tomorrow', caption: `${caption} · no attempts left today`, enabled: false };
  return g.cleared
    ? { kind: 'learning', label: 'Play', caption, enabled: true }
    : { kind: 'guided', label: 'Play', caption, enabled: true };
}

/** A puzzle is "easy" for pruning when its skill level is gold or silver. */
export const isEasy = (level: Level) => level === 'gold' || level === 'silver';

const LEVEL_RANK: Record<Level, number> = { gold: 5, silver: 4, green: 3, yellow: 2, red: 1, new: 0 };

/**
 * Ids ordered from easiest to hardest, so the puzzles most worth pruning come first: by skill level (gold, then
 * silver, ...), then by score, then by how many attempts back that up. Puzzles never attempted come last.
 */
export function easiestFirst(ids: readonly string[], progress: Record<string, Attempt[]>): string[] {
  const skill = (id: string) => computeSkill(progress[id]);
  return [...ids].sort((a, b) => {
    const x = skill(a);
    const y = skill(b);
    return LEVEL_RANK[y.level] - LEVEL_RANK[x.level] || y.score - x.score || y.attempts - x.attempts;
  });
}
