import { type Board } from '../go/board';
import { initialBoard } from '../go/setup';
import { type Dims, type Point, type SgfNode, nodeMove } from '../sgf/parser';
import { preferredChild } from './lines';

export interface SolutionDiagram {
  /** The position after the whole main line is played (setup stones included, captured stones gone). */
  board: Board;
  /** The moves of the main line, 1-based, whose stone is still on the board. Setup stones are not numbered. */
  numbers: { point: Point; n: number }[];
}

/**
 * The paper-mode answer: the puzzle's main solution line (the branch marked correct, else the first one that does
 * not lead only to failure) played onto the starting position, each move numbered in order. A move on a point that
 * was played before (after a capture) keeps its first number only if that stone is still there.
 */
export function solutionDiagram(root: SgfNode, dims: Dims): SolutionDiagram {
  let board = initialBoard(root, dims);
  const moves: { point: Point; n: number; color: 'B' | 'W' }[] = [];
  let n = 0;
  for (let node = preferredChild(root); node; node = preferredChild(node)) {
    const m = nodeMove(node, dims);
    if (!m) continue;
    n++;
    if (!m.point) continue; // a pass
    const r = board.play(m.point, m.color);
    if (!r) continue;
    board = r.board;
    moves.push({ point: m.point, n, color: m.color });
  }
  // keep a number only for the latest move on a point, and only while a stone of that color still stands there
  const last = new Map<string, (typeof moves)[number]>();
  for (const m of moves) last.set(`${m.point.x},${m.point.y}`, m);
  const numbers = [...last.values()]
    .filter((m) => board.get(m.point) === m.color)
    .map((m) => ({ point: m.point, n: m.n }))
    .sort((a, b) => a.n - b.n);
  return { board, numbers };
}
