/**
 * "New from game": turn part of a real game into a puzzle. Load a game, pick the moves to keep (everything before
 * them becomes the starting position), and pick the part of the board to keep. Pure TS, no React.
 *
 * Only the main line of the game is used (variations are ignored). Moves are numbered from 1; "position k" is the
 * board after the first k moves, so position 0 is the board before any move (handicap stones included).
 */
import { Board } from '../go/board';
import {
  type Color,
  type Dims,
  type Point,
  type SgfNode,
  MAX_DIM,
  MIN_DIM,
  NO_OPEN_EDGES,
  boardDims,
  nodeMove,
  parseSgf,
  pointList,
  pointToSgf,
  splitCollection,
  toSgf,
} from './parser';
import { writeBoardProps } from './editing';
import { type Validation, validateSgf } from './validate';

export interface GameMove {
  color: Color;
  /** null for a pass */
  point: Point | null;
  /** false if the move was illegal on the board (occupied, suicide, ko): it is skipped */
  legal: boolean;
}

export interface Game {
  dims: Dims;
  /** main-line moves, move k is moves[k - 1] */
  moves: GameMove[];
  /** boards[k] is the position after k moves */
  boards: Board[];
  /** a name for the game: GN, or "White vs Black", or the event */
  name: string;
  /** how many games the file held (only the first is used) */
  gamesInFile: number;
}

/** An inclusive rectangle of the board. */
export interface Crop {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type LoadResult = { game: Game } | { error: string };

const cleanName = (s: string | undefined) => s?.trim().replace(/\s+/g, ' ') || undefined;

/** Read the first game in some SGF text. */
export function loadGame(text: string): LoadResult {
  const trees = splitCollection(text).filter((t) => /^\s*\(\s*;/.test(t));
  if (!trees.length) return { error: 'No game found in that text. Is it an SGF file?' };
  let root: SgfNode;
  try {
    root = parseSgf(trees[0]);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const dims = boardDims(root);
  if (dims.cols < MIN_DIM || dims.rows < MIN_DIM || dims.cols > MAX_DIM || dims.rows > MAX_DIM)
    return { error: 'That board size is not supported.' };

  const moves: GameMove[] = [];
  const boards: Board[] = [];
  let board = new Board(dims.cols, dims.rows);
  const setup = (n: SgfNode) => {
    for (const p of pointList(n.props.AE, dims)) board = board.withStone(p, null);
    for (const p of pointList(n.props.AB, dims)) board = board.withStone(p, 'B');
    for (const p of pointList(n.props.AW, dims)) board = board.withStone(p, 'W');
  };
  setup(root);
  boards.push(board);
  for (let n: SgfNode | undefined = root.children[0]; n; n = n.children[0]) {
    setup(n); // a setup-only node changes the board for the move after it
    const m = nodeMove(n, dims);
    if (!m) {
      boards[boards.length - 1] = board;
      continue;
    }
    const r = board.play(m.point, m.color);
    if (r) board = r.board;
    moves.push({ color: m.color, point: m.point, legal: !!r });
    boards.push(board);
  }
  if (!moves.length) return { error: 'That game has no moves.' };

  const white = cleanName(root.props.PW?.[0]);
  const black = cleanName(root.props.PB?.[0]);
  const name =
    cleanName(root.props.GN?.[0]) ??
    (white && black ? `${white} vs ${black}` : undefined) ??
    cleanName(root.props.EV?.[0]) ??
    'Game';
  return { game: { dims, moves, boards, name, gamesInFile: trees.length } };
}

/** The crop that is the whole board. */
export const fullCrop = (dims: Dims): Crop => ({ x0: 0, y0: 0, x1: dims.cols - 1, y1: dims.rows - 1 });

export const cropDims = (c: Crop): Dims => ({ cols: c.x1 - c.x0 + 1, rows: c.y1 - c.y0 + 1 });

const inside = (c: Crop, p: Point) => p.x >= c.x0 && p.x <= c.x1 && p.y >= c.y0 && p.y <= c.y1;

/** Numbers (1-based) of the legal moves in `start+1 .. end`. */
export function movesInRange(game: Game, start: number, end: number): number[] {
  const out: number[] = [];
  for (let k = Math.max(0, start) + 1; k <= Math.min(end, game.moves.length); k++)
    if (game.moves[k - 1].legal) out.push(k);
  return out;
}

/**
 * A good starting crop for the chosen moves: the box around them and the stones near them, with some room, snapped
 * to a board edge that is close, and never smaller than 7 points on a side (or the board, if it is smaller).
 */
export function fitCrop(game: Game, start: number, end: number, margin = 3): Crop {
  const { cols, rows } = game.dims;
  const pts: Point[] = [];
  for (const k of movesInRange(game, start, end)) {
    const p = game.moves[k - 1].point;
    if (p) pts.push(p);
  }
  if (!pts.length) return fullCrop(game.dims);
  let x0 = Math.min(...pts.map((p) => p.x)) - margin;
  let x1 = Math.max(...pts.map((p) => p.x)) + margin;
  let y0 = Math.min(...pts.map((p) => p.y)) - margin;
  let y1 = Math.max(...pts.map((p) => p.y)) + margin;
  const snap = 2;
  if (x0 <= snap) x0 = 0;
  if (y0 <= snap) y0 = 0;
  if (x1 >= cols - 1 - snap) x1 = cols - 1;
  if (y1 >= rows - 1 - snap) y1 = rows - 1;
  return clampCrop({ x0, y0, x1, y1 }, game.dims);
}

const MIN_SIDE = 7;

/** Keep a crop on the board, at least MIN_SIDE points wide and high (or the whole board if that is smaller). */
export function clampCrop(c: Crop, dims: Dims): Crop {
  const fit = (lo: number, hi: number, size: number): [number, number] => {
    const min = Math.min(MIN_SIDE, size);
    lo = Math.max(0, Math.min(lo, size - 1));
    hi = Math.max(0, Math.min(hi, size - 1));
    if (hi - lo + 1 < min) {
      hi = Math.min(size - 1, lo + min - 1);
      lo = Math.max(0, hi - min + 1);
    }
    return [lo, hi];
  };
  const [x0, x1] = fit(c.x0, c.x1, dims.cols);
  const [y0, y1] = fit(c.y0, c.y1, dims.rows);
  return { x0, y0, x1, y1 };
}

export interface CropCheck {
  /** moves (numbers) that are played outside the crop: they can't be part of the puzzle */
  outside: number[];
  /** the first move (number) after which the cut-down board no longer matches the real one: a capture is missed or
   * a move is illegal because the cut edge acts like a wall. Only checked when nothing is outside. */
  differs: number | null;
}

function cropBoard(b: Board, c: Crop): Board {
  const { cols, rows } = cropDims(c);
  let out = new Board(cols, rows);
  for (let y = c.y0; y <= c.y1; y++)
    for (let x = c.x0; x <= c.x1; x++) {
      const s = b.get({ x, y });
      if (s) out = out.withStone({ x: x - c.x0, y: y - c.y0 }, s);
    }
  return out;
}

const sameGrid = (a: Board, b: Board) => a.grid.length === b.grid.length && a.grid.every((v, i) => v === b.grid[i]);

/** Does this crop work for these moves? Replays them on the cut-down board and compares with the real game. */
export function checkCrop(game: Game, start: number, end: number, crop: Crop): CropCheck {
  const ks = movesInRange(game, start, end);
  const outside = ks.filter((k) => {
    const p = game.moves[k - 1].point;
    return p && !inside(crop, p);
  });
  if (outside.length) return { outside, differs: null };
  let cut = cropBoard(game.boards[start], crop);
  for (const k of ks) {
    const m = game.moves[k - 1];
    const r = cut.play(m.point && { x: m.point.x - crop.x0, y: m.point.y - crop.y0 }, m.color);
    if (!r) return { outside, differs: k };
    cut = r.board;
    if (!sameGrid(cut, cropBoard(game.boards[k], crop))) return { outside, differs: k };
  }
  return { outside, differs: null };
}

export interface Selection {
  /** moves before this are the starting position */
  start: number;
  /** the last move of the puzzle */
  end: number;
  crop: Crop;
  title: string;
}

export interface Extracted {
  sgf: string;
  validation: Validation;
  check: CropCheck;
}

/** Build the puzzle: the position after `start` moves as setup stones, then moves start+1..end as the solution. */
export function extractPuzzle(game: Game, sel: Selection): Extracted {
  const { start, end, crop } = sel;
  const check = checkCrop(game, start, end, crop);
  const size = cropDims(crop);
  const ks = movesInRange(game, start, end);
  const root: SgfNode = {
    props: { GM: ['1'], FF: ['4'], GN: [sel.title.trim() || game.name] },
    children: [],
    parent: null,
  };
  // The sides of the crop that are not the real edge of the board are drawn open, like a diagram cut from a bigger board.
  writeBoardProps(root, size, {
    ...NO_OPEN_EDGES,
    left: crop.x0 > 0,
    top: crop.y0 > 0,
    right: crop.x1 < game.dims.cols - 1,
    bottom: crop.y1 < game.dims.rows - 1,
  });
  const black: Point[] = [];
  const white: Point[] = [];
  const at = game.boards[start];
  for (let y = crop.y0; y <= crop.y1; y++)
    for (let x = crop.x0; x <= crop.x1; x++) {
      const s = at.get({ x, y });
      if (s) (s === 'B' ? black : white).push({ x: x - crop.x0, y: y - crop.y0 });
    }
  if (black.length) root.props.AB = black.map(pointToSgf);
  if (white.length) root.props.AW = white.map(pointToSgf);
  if (ks.length) root.props.PL = [game.moves[ks[0] - 1].color];

  let parent = root;
  for (const k of ks) {
    const m = game.moves[k - 1];
    const sg = m.point && inside(crop, m.point) ? pointToSgf({ x: m.point.x - crop.x0, y: m.point.y - crop.y0 }) : '';
    const node: SgfNode = { props: { [m.color]: [sg] }, children: [], parent };
    parent.children.push(node);
    parent = node;
  }
  if (parent !== root) parent.props.TE = ['1']; // the end of the line is the solution
  const sgf = toSgf(root);
  return { sgf, validation: validateSgf(sgf), check };
}

export type CropSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * Move one side of the crop outward (`by` > 0) or inward (`by` < 0). A move that would leave the board or make the
 * crop smaller than 7 points (or the board, if that is smaller) changes nothing.
 */
export function moveSide(crop: Crop, side: CropSide, by: number, dims: Dims): Crop {
  const next = { ...crop };
  if (side === 'left') next.x0 -= by;
  if (side === 'right') next.x1 += by;
  if (side === 'top') next.y0 -= by;
  if (side === 'bottom') next.y1 += by;
  const ok =
    next.x0 >= 0 &&
    next.y0 >= 0 &&
    next.x1 <= dims.cols - 1 &&
    next.y1 <= dims.rows - 1 &&
    next.x1 - next.x0 + 1 >= Math.min(MIN_SIDE, dims.cols) &&
    next.y1 - next.y0 + 1 >= Math.min(MIN_SIDE, dims.rows);
  return ok ? next : crop;
}
