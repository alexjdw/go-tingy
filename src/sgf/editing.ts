import { type Dims, type OpenEdges, type Point, type SgfNode, formatOpenEdges, formatSize, nodeMove } from './parser';

export interface ResizeResult {
  black: Point[];
  white: Point[];
  /** setup stones that no longer fit on the board */
  dropped: number;
  /** true if every move in the tree still fits (otherwise the caller should clear the tree) */
  treeFits: boolean;
}

/** What survives when a board changes from `from` to `to`: stones inside the new board, and whether the tree fits. */
export function resizeSetup(black: Point[], white: Point[], root: SgfNode, from: Dims, to: Dims): ResizeResult {
  const fits = (p: Point) => p.x < to.cols && p.y < to.rows;
  const keptBlack = black.filter(fits);
  const keptWhite = white.filter(fits);
  const treeFits = (n: SgfNode): boolean => {
    const p = nodeMove(n, from)?.point;
    return (!p || fits(p)) && n.children.every(treeFits);
  };
  return {
    black: keptBlack,
    white: keptWhite,
    dropped: black.length - keptBlack.length + (white.length - keptWhite.length),
    treeFits: treeFits(root),
  };
}

/** Write the board shape into the root node: SZ always, OE only when some border is open. */
export function writeBoardProps(root: SgfNode, dims: Dims, open: OpenEdges) {
  root.props.SZ = [formatSize(dims)];
  const oe = formatOpenEdges(open);
  if (oe) root.props.OE = [oe];
  else delete root.props.OE;
}
