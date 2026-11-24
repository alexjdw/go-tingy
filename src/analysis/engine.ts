import type { Color } from '../sgf/parser';

/** One analysis request for a position, in the engine's own terms. */
export interface Query {
  cols: number;
  rows: number;
  initialStones: [Color, string][];
  /** moves played from the initial stones, in order */
  moves: [Color, string][];
  /** who moves in the position (after `moves`) */
  player: Color;
  maxVisits: number;
  /** analyse only these moves for the side to move (to judge a move the engine would not otherwise look at) */
  onlyMoves?: string[];
}

export interface MoveInfo {
  move: string;
  visits: number;
  /** the side to move's chance of winning (0..1) if this move is played */
  winrate: number;
  /** points ahead for the side to move if this move is played */
  scoreLead: number;
  /** the network's own first impression of the move (0..1) */
  prior: number;
  /** 0 is the engine's favorite */
  order: number;
  pv: string[];
}

export interface Analysis {
  moves: MoveInfo[];
}

/** Anything that can answer a Query: KataGo over a pipe, a test double, a remote service. */
export interface Analyzer {
  analyze(query: Query): Promise<Analysis>;
}
