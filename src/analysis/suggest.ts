import type { Analyzer } from './engine';
import { type Setup, embedSetup, moveName, pointOf, regionFromPoints } from './position';
import type { Color, Point } from '../sgf/parser';

/** A move the engine would consider at a position, with what it thinks of it. */
export interface Suggestion {
  point: Point | null;
  /** the side to move's chance of winning if it plays this (0..1) */
  winrate: number;
  /** points ahead for the side to move if it plays this */
  scoreLead: number;
  visits: number;
  /** the network's first impression of the move (0..1) */
  prior: number;
  /** the engine's line of play from here, starting with this move */
  line: Point[];
}

export interface SuggestOptions {
  maxVisits?: number;
  /** most suggestions to return */
  count?: number;
}

/**
 * The engine's favorite moves at a position of a puzzle: the starting setup, the moves played since, and who moves
 * now. `treePoints` is every point the puzzle's tree uses; the engine only looks near them and the stones, so a
 * corner problem is not answered with a move elsewhere on the board.
 */
export async function suggestMoves(
  analyzer: Analyzer,
  setup: Setup,
  played: { color: Color; point: Point | null }[],
  toMove: Color,
  treePoints: Point[],
  opts: SuggestOptions = {},
): Promise<Suggestion[]> {
  const e = embedSetup(setup);
  const region = regionFromPoints([...setup.black, ...setup.white, ...treePoints], e, setup.dims);
  const result = await analyzer.analyze({
    cols: e.cols,
    rows: e.rows,
    initialStones: e.initialStones,
    moves: played.map((m) => [m.color, moveName(e, m.point)]),
    player: toMove,
    maxVisits: opts.maxVisits ?? 400,
    onlyMoves: region ?? undefined,
  });
  return [...result.moves]
    .sort((a, b) => a.order - b.order)
    .slice(0, opts.count ?? 5)
    .map((m) => ({
      point: pointOf(e, m.move, setup.dims),
      winrate: m.winrate,
      scoreLead: m.scoreLead,
      visits: m.visits,
      prior: m.prior,
      line: m.pv.map((n) => pointOf(e, n, setup.dims)).filter((p): p is Point => p !== null),
    }));
}
