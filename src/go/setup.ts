import { type Dims, type SgfNode, pointList } from '../sgf/parser';
import { Board } from './board';

/** The position at the start of a puzzle: the root node's setup stones (AE, then AB, then AW) on an empty board. */
export function initialBoard(root: SgfNode, dims: Dims): Board {
  let board = new Board(dims.cols, dims.rows);
  for (const p of pointList(root.props.AE, dims)) board = board.withStone(p, null);
  for (const p of pointList(root.props.AB, dims)) board = board.withStone(p, 'B');
  for (const p of pointList(root.props.AW, dims)) board = board.withStone(p, 'W');
  return board;
}
