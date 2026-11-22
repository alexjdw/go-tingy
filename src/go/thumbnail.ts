/**
 * Puzzle thumbnails: the starting position drawn in a small fixed window (7x7 points). Only what fits in the
 * window is drawn, so the window is chosen to show as much of the position as possible, and to show the board
 * edge when the stones are near it.
 */
import { type Dims, type OpenEdges, type Point, boardDims, nodeMove, openEdges, parseSgf } from '../sgf/parser';
import { Board } from './board';
import { initialBoard } from './setup';
import { type Viewport } from './viewport';

export const THUMB_SIZE = 7;

/**
 * The `size` x `size` window (smaller on a smaller board) that covers the most stones. `focus` (the first move of
 * the solution) counts for extra so that the window shows where the action is. Ties go to the window whose center
 * is nearest the middle of the stones, then to the top-left. Near a board edge the window snaps to it when that
 * loses nothing, so corner and side problems are drawn with their edge.
 */
export function thumbnailWindow(stones: Point[], focus: Point | null, dims: Dims, size = THUMB_SIZE): Viewport {
  const w = Math.min(size, dims.cols);
  const h = Math.min(size, dims.rows);
  const all = focus ? [...stones, focus] : stones;
  const score = (x0: number, y0: number) => {
    const inside = (p: Point) => p.x >= x0 && p.x < x0 + w && p.y >= y0 && p.y < y0 + h;
    return stones.filter(inside).length + (focus && inside(focus) ? 2 : 0);
  };
  const cx = all.length ? all.reduce((s, p) => s + p.x, 0) / all.length : 0;
  const cy = all.length ? all.reduce((s, p) => s + p.y, 0) / all.length : 0;
  const dist = (x0: number, y0: number) => Math.hypot(x0 + (w - 1) / 2 - cx, y0 + (h - 1) / 2 - cy);

  let best = { x0: 0, y0: 0, s: -1, d: Infinity };
  for (let y0 = 0; y0 <= dims.rows - h; y0++) {
    for (let x0 = 0; x0 <= dims.cols - w; x0++) {
      const s = score(x0, y0);
      const d = dist(x0, y0);
      if (s > best.s || (s === best.s && d < best.d - 1e-9)) best = { x0, y0, s, d };
    }
  }

  let { x0, y0 } = best;
  const snap = (cur: number, max: number, test: (v: number) => number) => {
    for (const edge of [0, max]) if (edge !== cur && Math.abs(edge - cur) <= 2 && test(edge) >= best.s) return edge;
    return cur;
  };
  x0 = snap(x0, dims.cols - w, (v) => score(v, y0));
  y0 = snap(y0, dims.rows - h, (v) => score(x0, v));
  return { x0, x1: x0 + w - 1, y0, y1: y0 + h - 1 };
}

export interface Preview {
  board: Board;
  dims: Dims;
  open: OpenEdges;
  view: Viewport;
  /** how many setup stones there are on the whole board */
  stones: number;
}

/** What a tile needs to draw a puzzle: its starting position and the window to draw it in. */
export function puzzlePreview(sgf: string): Preview {
  const root = parseSgf(sgf);
  const dims = boardDims(root);
  const board = initialBoard(root, dims);
  const stones: Point[] = [];
  for (let y = 0; y < dims.rows; y++)
    for (let x = 0; x < dims.cols; x++) if (board.get({ x, y })) stones.push({ x, y });
  const first = root.children[0] ? (nodeMove(root.children[0], dims)?.point ?? null) : null;
  return {
    board,
    dims,
    open: openEdges(root),
    view: thumbnailWindow(stones, first, dims),
    stones: stones.length,
  };
}

const cache = new Map<string, Preview>();
const CACHE_LIMIT = 600;

/** `puzzlePreview` with a small cache: a library of hundreds of tiles is redrawn as you scroll. */
export function cachedPreview(sgf: string): Preview {
  const hit = cache.get(sgf);
  if (hit) return hit;
  let p: Preview;
  try {
    p = puzzlePreview(sgf);
  } catch {
    const dims = { cols: THUMB_SIZE, rows: THUMB_SIZE };
    p = {
      board: new Board(dims.cols, dims.rows),
      dims,
      open: openEdges({ props: {}, children: [], parent: null }),
      view: { x0: 0, x1: THUMB_SIZE - 1, y0: 0, y1: THUMB_SIZE - 1 },
      stones: 0,
    };
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(sgf, p);
  return p;
}
