import { type Dims, type OpenEdges, type Point, hasOpenEdge } from '../sgf/parser';

/** The rectangle of intersections currently shown (inclusive). */
export interface Viewport {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const fullViewport = (dims: Dims): Viewport => ({ x0: 0, x1: dims.cols - 1, y0: 0, y1: dims.rows - 1 });

/**
 * What to show when a problem opens. A plain square board (a full-size board holding a local problem) is
 * cropped around the stones. A rectangular board, or one with open edges, was sized by its author as the
 * diagram itself, so it is shown whole.
 */
export function initialViewport(points: Point[], dims: Dims, open: OpenEdges): Viewport {
  return dims.cols === dims.rows && !hasOpenEdge(open) ? computeViewport(points, dims) : fullViewport(dims);
}

/** Crop to the area around the stones, snapping to board edges (typical tsumego diagram). */
export function computeViewport(points: Point[], dims: Dims): Viewport {
  const xMax = dims.cols - 1;
  const yMax = dims.rows - 1;
  if (!points.length) return fullViewport(dims);
  let x0 = Math.min(...points.map((p) => p.x));
  let x1 = Math.max(...points.map((p) => p.x));
  let y0 = Math.min(...points.map((p) => p.y));
  let y1 = Math.max(...points.map((p) => p.y));
  const pad = 2;
  const snap = 3;
  x0 = x0 - pad <= snap ? 0 : x0 - pad;
  y0 = y0 - pad <= snap ? 0 : y0 - pad;
  x1 = x1 + pad >= xMax - snap ? xMax : x1 + pad;
  y1 = y1 + pad >= yMax - snap ? yMax : y1 + pad;
  // ensure a usable minimum
  if (x1 - x0 < 6) x1 = Math.min(xMax, x0 + 6);
  if (y1 - y0 < 6) y1 = Math.min(yMax, y0 + 6);
  return { x0, x1, y0, y1 };
}

export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** a real board border: drawn heavier */
  heavy: boolean;
}

export interface GridGeometry {
  cell: number;
  width: number;
  height: number;
  /** pixel position of an intersection */
  px: (x: number) => number;
  py: (y: number) => number;
  vertical: GridLine[];
  horizontal: GridLine[];
  /** which sides of the picture are real board borders */
  real: Record<'left' | 'right' | 'top' | 'bottom', boolean>;
}

/** Wood margin around the outermost intersections, in cells. */
export const MARGIN = 0.8;

/**
 * Where to draw the grid. A side is a real border only if the view reaches the board's edge and that edge
 * isn't open. A real border is a heavier outer line that stops at the last point. Every other side (cropped
 * by the view, or open) runs its lines out to the edge of the picture, to show that the board continues.
 */
export function gridGeometry(view: Viewport, dims: Dims, open: OpenEdges, width: number): GridGeometry {
  const cols = view.x1 - view.x0 + 1;
  const rows = view.y1 - view.y0 + 1;
  const cell = width / (cols - 1 + MARGIN * 2);
  const height = cell * (rows - 1 + MARGIN * 2);
  const px = (x: number) => (x - view.x0 + MARGIN) * cell;
  const py = (y: number) => (y - view.y0 + MARGIN) * cell;

  const real = {
    left: view.x0 === 0 && !open.left,
    right: view.x1 === dims.cols - 1 && !open.right,
    top: view.y0 === 0 && !open.top,
    bottom: view.y1 === dims.rows - 1 && !open.bottom,
  };
  const left = real.left ? px(view.x0) : 0;
  const right = real.right ? px(view.x1) : width;
  const top = real.top ? py(view.y0) : 0;
  const bottom = real.bottom ? py(view.y1) : height;

  const vertical = Array.from({ length: cols }, (_, i) => ({
    x1: px(view.x0 + i),
    x2: px(view.x0 + i),
    y1: top,
    y2: bottom,
    heavy: (i === 0 && real.left) || (i === cols - 1 && real.right),
  }));
  const horizontal = Array.from({ length: rows }, (_, i) => ({
    x1: left,
    x2: right,
    y1: py(view.y0 + i),
    y2: py(view.y0 + i),
    heavy: (i === 0 && real.top) || (i === rows - 1 && real.bottom),
  }));
  return { cell, width, height, px, py, vertical, horizontal, real };
}
