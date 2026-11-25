import type { Analyzer } from './engine';
import { type Setup, embedSetup, moveName, pointOf, regionFromPoints } from './position';
import type { Color, Point } from '../sgf/parser';
import { type Verdict, verdictFor } from './review';

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

/** How a move just played compares with what KataGo would have played instead. */
export interface MoveJudgement {
  verdict: Verdict;
  /** win chance given away against the favorite (0..1) */
  loss: number;
  /** points given away */
  pointLoss: number;
  /** the favorite it is measured against */
  favorite: Suggestion;
}

/**
 * Judge a move by what happens after KataGo's best reply to it: the mover's chances then, against the mover's chances
 * with the favorite move (from the position before it was played). `replyWinrate` and `replyLead` are the replying
 * side's, as KataGo reports them. A move that gives away a lot is refuted.
 */
export function judgeMove(favorite: Suggestion, replyWinrate: number, replyLead: number): MoveJudgement {
  const loss = Math.max(0, favorite.winrate - (1 - replyWinrate));
  const pointLoss = Math.max(0, favorite.scoreLead + replyLead);
  return { verdict: verdictFor(loss, pointLoss), loss, pointLoss, favorite };
}

/**
 * When a move counts as refuted (and is marked wrong): it gives away at least this much win chance, or this many
 * points. Points matter most: in a corner problem the win chance of the whole game barely moves, while a group that
 * dies costs tens of points. The bar is higher than the review's "bad" so that a valid but smaller solution (one that
 * lives with fewer points) is not marked wrong; a tried-and-wasted move, which gives away 5 to 12 points, is not either.
 */
export const REFUTED = { win: 0.3, points: 15 };

export const isRefuted = (j: MoveJudgement): boolean => j.loss >= REFUTED.win || j.pointLoss >= REFUTED.points;
