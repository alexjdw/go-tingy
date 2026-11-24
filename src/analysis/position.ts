import {
  type Color,
  type Dims,
  type Point,
  type SgfNode,
  allPoints,
  boardDims,
  firstMoveColor,
  nodeMove,
  openEdges,
  type OpenEdges,
  pointList,
} from '../sgf/parser';

/** Largest board KataGo's standard builds accept. */
export const ENGINE_MAX = 19;

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

/**
 * How a puzzle sits on the board the engine sees. A cropped diagram's open edges are not real board edges, so
 * the puzzle is placed on a bigger board, with its closed edges against the real ones and the open sides
 * continuing as empty points. Closed (or fully shown) puzzles keep their own size.
 */
export interface Embedding {
  cols: number;
  rows: number;
  /** where the puzzle's top-left point lies on the engine's board */
  dx: number;
  dy: number;
  initialStones: [Color, string][];
  /** who moves first in the puzzle */
  player: Color;
}

function axis(size: number, openStart: boolean, openEnd: boolean): { size: number; offset: number } {
  if (!openStart && !openEnd) return { size, offset: 0 };
  const full = Math.max(size, ENGINE_MAX);
  if (!openStart) return { size: full, offset: 0 };
  if (!openEnd) return { size: full, offset: full - size };
  return { size: full, offset: Math.floor((full - size) / 2) };
}

/** GTP name of a point of the engine's board, e.g. "D4" (column letters skip I, row 1 at the bottom). */
export const gtpName = (x: number, y: number, rows: number) => `${LETTERS[x]}${rows - y}`;

/** A puzzle's starting position, in the puzzle's own terms. */
export interface Setup {
  dims: Dims;
  open: OpenEdges;
  black: Point[];
  white: Point[];
  /** who moves first */
  player: Color;
}

export function embedSetup(setup: Setup): Embedding {
  const { dims, open } = setup;
  if (dims.cols > ENGINE_MAX || dims.rows > ENGINE_MAX) {
    throw new Error(
      `The engine handles boards up to ${ENGINE_MAX}x${ENGINE_MAX}, this one is ${dims.cols}x${dims.rows}`,
    );
  }
  const ax = axis(dims.cols, open.left, open.right);
  const ay = axis(dims.rows, open.top, open.bottom);
  const stones: [Color, string][] = [];
  for (const p of setup.black) stones.push(['B', gtpName(p.x + ax.offset, p.y + ay.offset, ay.size)]);
  for (const p of setup.white) stones.push(['W', gtpName(p.x + ax.offset, p.y + ay.offset, ay.size)]);
  return { cols: ax.size, rows: ay.size, dx: ax.offset, dy: ay.offset, initialStones: stones, player: setup.player };
}

export function embed(root: SgfNode): Embedding {
  const dims = boardDims(root);
  return embedSetup({
    dims,
    open: openEdges(root),
    black: pointList(root.props.AB, dims),
    white: pointList(root.props.AW, dims),
    player: firstMoveColor(root),
  });
}

/** The engine's name for a move (`null` is a pass). */
export function moveName(e: Embedding, p: Point | null): string {
  return p ? gtpName(p.x + e.dx, p.y + e.dy, e.rows) : 'pass';
}

/** The puzzle's point for an engine move name, or null for a pass or a point outside the puzzle's own board. */
export function pointOf(e: Embedding, name: string, dims: Dims): Point | null {
  const m = /^([A-HJ-Z])(\d+)$/.exec(name);
  if (!m) return null;
  const x = LETTERS.indexOf(m[1]) - e.dx;
  const y = e.rows - Number(m[2]) - e.dy;
  return x >= 0 && y >= 0 && x < dims.cols && y < dims.rows ? { x, y } : null;
}

/** The moves from the root down to `node`, as the engine wants them. Setup stones below the root are not supported. */
export function movesTo(node: SgfNode, e: Embedding, dims: Dims): [Color, string][] {
  const out: [Color, string][] = [];
  for (let n: SgfNode | null = node; n && n.parent; n = n.parent) {
    const m = nodeMove(n, dims);
    if (m) out.push([m.color, moveName(e, m.point)]);
  }
  return out.reverse();
}

/** Who moves at `node`: the other color from the last move on the way there, or the puzzle's first player. */
export function toMoveAt(node: SgfNode, e: Embedding, dims: Dims): Color {
  for (let n: SgfNode | null = node; n && n.parent; n = n.parent) {
    const m = nodeMove(n, dims);
    if (m) return m.color === 'B' ? 'W' : 'B';
  }
  return e.player;
}

/** How far past the stones and moves of a puzzle the engine may look for moves. */
export const REGION_MARGIN = 3;

/**
 * Every point near the puzzle (its stones and every move of its tree, widened by `margin`), as engine names. The
 * engine is only asked about these: a corner problem must not be answered with a move on the other side of the
 * board. Null if the puzzle has no stones or moves to go by.
 */
export function regionMoves(root: SgfNode, e: Embedding, dims: Dims, margin = REGION_MARGIN): string[] | null {
  return regionFromPoints(allPoints(root), e, dims, margin);
}

export function regionFromPoints(pts: Point[], e: Embedding, dims: Dims, margin = REGION_MARGIN): string[] | null {
  if (!pts.length) return null;
  const x0 = Math.max(0, Math.min(...pts.map((p) => p.x)) - margin);
  const x1 = Math.min(dims.cols - 1, Math.max(...pts.map((p) => p.x)) + margin);
  const y0 = Math.max(0, Math.min(...pts.map((p) => p.y)) - margin);
  const y1 = Math.min(dims.rows - 1, Math.max(...pts.map((p) => p.y)) + margin);
  const out: string[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(moveName(e, { x, y }));
  return out;
}
