import { type Dims, coordName } from '../sgf/parser';
import type { Finding, PuzzleVerdict } from './review';

const move = (f: Finding, dims: Dims) => (f.point ? coordName(f.point, dims) : 'a pass');

/** A finding of the review in plain words, with where in the puzzle it is (the number of moves played to get there). */
export function describeFinding(f: Finding, dims: Dims): string {
  const at = f.key ? `After ${f.key.split(';').length} move${f.key.includes(';') ? 's' : ''}` : 'At the start';
  const m = move(f, dims);
  switch (f.kind) {
    case 'marked-correct-engine-disagrees':
      return `${at}: ${m} is marked correct, but KataGo thinks it is clearly worse than its favorite.`;
    case 'marked-wrong-engine-likes':
      return `${at}: ${m} is marked wrong, but KataGo rates it as good as any other move.`;
    case 'unmarked-engine-dislikes':
      return `${at}: ${m} is part of the solution, but KataGo thinks it is clearly worse than its favorite.`;
    case 'missing-reply':
      return `${at}: KataGo has a reply, ${m}, that does better than any reply the puzzle has.`;
    case 'missing-move':
      return `${at}: KataGo has a move, ${m}, that does better than any move the puzzle has.`;
  }
}

export function describeVerdict(v: PuzzleVerdict): string {
  switch (v) {
    case 'agrees':
      return 'KataGo agrees with the puzzle.';
    case 'incomplete':
      return "KataGo found replies the puzzle doesn't cover.";
    case 'diverges':
      return 'KataGo disagrees with part of the solution.';
    case 'unjudged':
      return "KataGo couldn't check this puzzle (it may be too long, or have no moves to look at).";
  }
}
