/**
 * Splitting a puzzle: take the position at some node of its tree, and everything played from there, as a puzzle of its
 * own. The stones on the board at that node become the starting stones, and the node's side to move plays first. Used to
 * cut a long problem into easier ones. Pure TS, no React.
 */
import { initialBoard } from '../go/setup';
import {
  type Color,
  type SgfNode,
  boardDims,
  firstMoveColor,
  flipColors,
  nodeMove,
  openEdges,
  pointList,
  pointToSgf,
  toSgf,
} from './parser';
import { writeBoardProps } from './editing';

/** A node can be split off if it is not the start and something is played after it. */
export const canSplitAt = (root: SgfNode, node: SgfNode): boolean =>
  node !== root && node.children.length > 0 && isInside(root, node);

function isInside(root: SgfNode, node: SgfNode): boolean {
  for (let n: SgfNode | null = node; n; n = n.parent) if (n === root) return true;
  return false;
}

const copyBelow = (node: SgfNode, parent: SgfNode): SgfNode => {
  const copy: SgfNode = {
    props: JSON.parse(JSON.stringify(node.props)) as Record<string, string[]>,
    children: [],
    parent,
  };
  copy.children = node.children.map((c) => copyBelow(c, copy));
  return copy;
};

/**
 * The SGF of the puzzle that starts at `node` of the tree `root`, or null if there is nothing to split off there.
 * `flipped` says that `root` has had its colors flipped for display (see `StudyEngine`): the new puzzle is written
 * with the original colors.
 */
export function splitAt(root: SgfNode, node: SgfNode, flipped = false): string | null {
  if (!canSplitAt(root, node)) return null;
  const dims = boardDims(root);
  const path: SgfNode[] = [];
  for (let n: SgfNode | null = node; n && n !== root; n = n.parent) path.unshift(n);

  let board = initialBoard(root, dims);
  let lastMover: Color | null = null;
  for (const n of path) {
    // a setup node changes the board for what follows it, as in a game record
    for (const p of pointList(n.props.AE, dims)) board = board.withStone(p, null);
    for (const p of pointList(n.props.AB, dims)) board = board.withStone(p, 'B');
    for (const p of pointList(n.props.AW, dims)) board = board.withStone(p, 'W');
    const m = nodeMove(n, dims);
    if (!m) continue;
    board = board.play(m.point, m.color)?.board ?? board;
    lastMover = m.color;
  }

  // whoever moves next in the tree is the first player of the new puzzle
  const next =
    nodeMove(node.children[0], dims)?.color ?? (lastMover ? (lastMover === 'B' ? 'W' : 'B') : firstMoveColor(root));
  const black: string[] = [];
  const white: string[] = [];
  for (let y = 0; y < dims.rows; y++) {
    for (let x = 0; x < dims.cols; x++) {
      const c = board.get({ x, y });
      if (c) (c === 'B' ? black : white).push(pointToSgf({ x, y }));
    }
  }

  const out: SgfNode = { props: { GM: ['1'], FF: ['4'], PL: [next] }, children: [], parent: null };
  writeBoardProps(out, dims, openEdges(root));
  if (black.length) out.props.AB = black;
  if (white.length) out.props.AW = white;
  out.children = node.children.map((c) => copyBelow(c, out));
  if (flipped) flipColors(out);
  return toSgf(out);
}
