import type { Analysis, Query } from './engine';

/**
 * KataGo's analysis-engine JSON protocol (`katago analysis`): one JSON query per line in, one JSON answer per
 * line out. These two functions only build and read the JSON, so they are testable without the engine; the
 * process handling is in `scripts/katago-process.ts`.
 *
 * Rules are fixed to Chinese area scoring with komi 0: a puzzle has no real komi, and what matters is the
 * difference between candidate moves, which the review takes against the engine's own favorite.
 */
export function toRequest(id: string, q: Query): Record<string, unknown> {
  const req: Record<string, unknown> = {
    id,
    rules: 'chinese',
    komi: 0,
    boardXSize: q.cols,
    boardYSize: q.rows,
    initialStones: q.initialStones,
    initialPlayer: q.player,
    moves: [] as unknown[],
    maxVisits: q.maxVisits,
  };
  // `moves` start with `initialPlayer`; ours begin with whoever moved first in the puzzle, and a position reached
  // after moves is described by its own moves, so the first mover is the first move's color.
  req.moves = q.moves;
  if (q.moves.length) req.initialPlayer = q.moves[0][0];
  else req.initialPlayer = q.player;
  if (q.onlyMoves) req.allowMoves = [{ player: q.player, moves: q.onlyMoves, untilDepth: 1 }];
  return req;
}

interface RawMoveInfo {
  move: string;
  visits: number;
  winrate: number;
  scoreLead: number;
  prior: number;
  order: number;
  pv?: string[];
}

interface RawResponse {
  id?: string;
  error?: string;
  warning?: string;
  rootInfo?: { currentPlayer?: string };
  moveInfos?: RawMoveInfo[];
}

/**
 * Read an answer. KataGo reports win chances for Black or for the side to move depending on its config
 * (`reportAnalysisWinratesAs`); the process is started with SIDETOMOVE, and `blackWinrates` is the fallback for
 * an engine configured the other way, so a wrong guess does not silently flip every verdict.
 */
export function fromResponse(raw: unknown, blackWinrates = false): Analysis {
  const r = raw as RawResponse;
  if (r.error) throw new Error(`KataGo: ${r.error}`);
  const toMove = r.rootInfo?.currentPlayer;
  const flip = blackWinrates && toMove === 'W';
  return {
    moves: (r.moveInfos ?? []).map((m) => ({
      move: m.move,
      visits: m.visits,
      winrate: flip ? 1 - m.winrate : m.winrate,
      scoreLead: flip ? -m.scoreLead : m.scoreLead,
      prior: m.prior,
      order: m.order,
      pv: m.pv ?? [],
    })),
  };
}
