import type { Analyzer, MoveInfo, Query } from './engine';
import { embed, moveName, movesTo, pointOf, regionMoves, toMoveAt } from './position';
import {
  type Color,
  type Point,
  type SgfNode,
  boardDims,
  containsCorrect,
  isCorrectNode,
  isWrongNode,
  leadsOnlyToFailure,
  nodeMove,
  parseSgf,
} from '../sgf/parser';
import { nodeKey } from '../study/lines';

/** How the engine sees a move compared with its favorite, by what the move gives away. */
export type Verdict = 'best' | 'ok' | 'worse' | 'bad';

/** What a move may give away and still count as best / ok / worse (more than that is bad). */
export interface Limits {
  best: number;
  ok: number;
  worse: number;
}

export interface Thresholds {
  /** win chance, 0..1 */
  win: Limits;
  /** points of score lead. In life and death the win chance saturates near 0 and 1, so points still tell moves apart. */
  points: Limits;
}

export interface ReviewOptions {
  maxVisits?: number;
  /** most engine questions to ask (a runaway tree must not run forever) */
  maxQueries?: number;
  thresholds?: Thresholds;
}

export const DEFAULTS = {
  maxVisits: 400,
  maxQueries: 150,
  thresholds: {
    win: { best: 0.02, ok: 0.1, worse: 0.3 },
    points: { best: 1.5, ok: 4, worse: 10 },
  },
};

const RANK: Verdict[] = ['best', 'ok', 'worse', 'bad'];
const within = (v: number, l: Limits): Verdict =>
  v <= l.best ? 'best' : v <= l.ok ? 'ok' : v <= l.worse ? 'worse' : 'bad';

/** The worse of the verdicts for the win chance and the score given away. */
export function verdictFor(winLoss: number, pointLoss: number, t: Thresholds = DEFAULTS.thresholds): Verdict {
  const a = within(winLoss, t.win);
  const b = within(pointLoss, t.points);
  return RANK[Math.max(RANK.indexOf(a), RANK.indexOf(b))];
}

export const isGood = (v: Verdict | null) => v === 'best' || v === 'ok';

/** A move the puzzle's tree has at some position, and what the engine thinks of it. */
export interface TreeMove {
  key: string;
  point: Point | null;
  marked: 'correct' | 'wrong' | null;
  /** win chance given away against the engine's favorite; null if the engine could not judge it */
  loss: number | null;
  /** points of score lead given away */
  pointLoss: number | null;
  verdict: Verdict | null;
  /** the engine's rank for the move (0 = favorite), null if it never looked at it unprompted */
  rank: number | null;
}

/** A move the engine likes at a position that the puzzle's tree does not have. */
export interface Missing {
  point: Point | null;
  winrate: number;
  loss: number;
  pointLoss: number;
  /** "best" is as good as the favorite, "ok" a fine alternative */
  verdict: Verdict;
  /**
   * Better for the side to move than every move the tree has here (by more than a fine alternative would be). That
   * is a real gap in the tree; a move that is merely as good changes nothing, as in any settled position.
   */
  beatsTree: boolean;
  prior: number;
  pv: string[];
}

export interface NodeReview {
  /** the position, as the key of the node it follows ("" is the start) */
  key: string;
  toMove: Color;
  /** is it the puzzle's first player to move? */
  learner: boolean;
  /** does the tree continue from here? (A last move needs no more answers.) */
  hasKids: boolean;
  moves: TreeMove[];
  /** engine moves within the "ok" range that the tree lacks, best first */
  missing: Missing[];
  /** the engine's favorite */
  best: { point: Point | null; winrate: number } | null;
}

export type FindingKind =
  /** a learner move marked correct that the engine thinks is clearly worse than its favorite */
  | 'marked-correct-engine-disagrees'
  /** a learner move marked wrong that is as good as the engine's favorite */
  | 'marked-wrong-engine-likes'
  /** an unmarked learner move (so, part of the solution) that the engine thinks is clearly worse */
  | 'unmarked-engine-dislikes'
  /** the engine's favorite reply for the opponent is not in the tree */
  | 'missing-reply'
  /** a learner move as good as the engine's favorite is not in the tree (an alternative solution) */
  | 'missing-move';

export interface Finding {
  kind: FindingKind;
  /** the node concerned (the move itself, or for a missing move the position it is missing from) */
  key: string;
  point: Point | null;
}

/**
 * agrees: every learner move of the solution is fine and no reply is missing.
 * incomplete: the solution's moves are fine but the opponent has a good reply the tree lacks.
 * diverges: the engine disagrees with a move, or a wrong-marked move looks as good as any.
 * unjudged: the engine could not judge enough (query limit, or no learner move to look at).
 */
export type PuzzleVerdict = 'agrees' | 'incomplete' | 'diverges' | 'unjudged';

export interface Review {
  nodes: NodeReview[];
  findings: Finding[];
  verdict: PuzzleVerdict;
  /** the first node where the engine and the tree part ways, if they do */
  firstDivergence: string | null;
  /** does the tree mark any move as correct? */
  hasCorrectMarks: boolean;
  /** true if the query limit stopped the review early */
  truncated: boolean;
}

const DIVERGENCE: FindingKind[] = [
  'marked-correct-engine-disagrees',
  'marked-wrong-engine-likes',
  'unmarked-engine-dislikes',
];

/**
 * Ask the engine about every position of the puzzle's solution tree and compare its opinion with what the tree
 * says. This is a second opinion, not a proof: it needs a good network and enough visits, and it does not read
 * a lone corner the way a life-and-death solver would.
 */
export async function reviewPuzzle(sgf: string, analyzer: Analyzer, opts: ReviewOptions = {}): Promise<Review> {
  const root = parseSgf(sgf);
  const dims = boardDims(root);
  const e = embed(root);
  const region = regionMoves(root, e, dims) ?? undefined;
  const maxVisits = opts.maxVisits ?? DEFAULTS.maxVisits;
  const maxQueries = opts.maxQueries ?? DEFAULTS.maxQueries;
  const t = opts.thresholds ?? DEFAULTS.thresholds;
  const review: Review = {
    nodes: [],
    findings: [],
    verdict: 'unjudged',
    firstDivergence: null,
    hasCorrectMarks: containsCorrect(root),
    truncated: false,
  };
  let used = 0;

  const ask = async (node: SgfNode, toMove: Color, onlyMoves?: string[]): Promise<MoveInfo[]> => {
    used++;
    const q: Query = {
      cols: e.cols,
      rows: e.rows,
      initialStones: e.initialStones,
      moves: movesTo(node, e, dims),
      player: toMove,
      maxVisits,
      onlyMoves: onlyMoves ?? region,
    };
    return (await analyzer.analyze(q)).moves;
  };

  /** The engine's favorite: the best win chance, and among moves that are level on it, the most points. */
  const favorite = (infos: MoveInfo[]): MoveInfo | null => {
    if (!infos.length) return null;
    const top = Math.max(...infos.map((m) => m.winrate));
    return infos.filter((m) => top - m.winrate <= t.win.best).reduce((a, b) => (b.scoreLead > a.scoreLead ? b : a));
  };

  const walk = async (node: SgfNode): Promise<void> => {
    if (used >= maxQueries) {
      review.truncated = true;
      return;
    }
    const kids = node.children.filter((c) => nodeMove(c, dims));
    const toMove = toMoveAt(node, e, dims);
    const infos = await ask(node, toMove);
    const best = favorite(infos);
    const byName = new Map(infos.map((m) => [m.move, m]));
    const kidInfos: MoveInfo[] = [];
    const nr: NodeReview = {
      key: nodeKey(node),
      toMove,
      learner: toMove === e.player,
      hasKids: kids.length > 0,
      moves: [],
      missing: [],
      best: best ? { point: pointOf(e, best.move, dims), winrate: best.winrate } : null,
    };
    for (const c of kids) {
      const mv = nodeMove(c, dims)!;
      const name = moveName(e, mv.point);
      let info = byName.get(name);
      // A move the engine skipped is judged on its own, so "never considered" is not mistaken for "bad".
      if (!info && best && used < maxQueries) info = (await ask(node, toMove, [name])).find((m) => m.move === name);
      if (info) kidInfos.push(info);
      const loss = info && best ? Math.max(0, best.winrate - info.winrate) : null;
      const pointLoss = info && best ? Math.max(0, best.scoreLead - info.scoreLead) : null;
      nr.moves.push({
        key: nodeKey(c),
        point: mv.point,
        marked: isCorrectNode(c) ? 'correct' : isWrongNode(c) ? 'wrong' : null,
        loss,
        pointLoss,
        verdict: loss === null || pointLoss === null ? null : verdictFor(loss, pointLoss, t),
        rank: byName.get(name)?.order ?? null,
      });
    }
    const known = new Set(kids.map((c) => moveName(e, nodeMove(c, dims)!.point)));
    if (best) {
      for (const m of infos) {
        if (known.has(m.move)) continue;
        const loss = Math.max(0, best.winrate - m.winrate);
        const pointLoss = Math.max(0, best.scoreLead - m.scoreLead);
        const verdict = verdictFor(loss, pointLoss, t);
        if (!isGood(verdict)) continue;
        const treeBest = favorite(kidInfos);
        const beatsTree =
          treeBest !== null &&
          (m.winrate - treeBest.winrate > t.win.ok || m.scoreLead - treeBest.scoreLead > t.points.ok);
        nr.missing.push({
          point: pointOf(e, m.move, dims),
          winrate: m.winrate,
          loss,
          pointLoss,
          verdict,
          beatsTree,
          prior: m.prior,
          pv: m.pv,
        });
      }
      nr.missing.sort((a, b) => a.loss - b.loss || a.pointLoss - b.pointLoss);
    }
    review.nodes.push(nr);
    addFindings(review, nr);

    for (const c of kids) {
      if (!isWrongNode(c) && !leadsOnlyToFailure(c)) await walk(c);
    }
  };
  await walk(root);
  summarize(review);
  return review;
}

function addFindings(review: Review, nr: NodeReview) {
  const add = (kind: FindingKind, key: string, point: Point | null) => review.findings.push({ kind, key, point });
  if (nr.learner) {
    for (const m of nr.moves) {
      if (m.verdict === null) continue;
      const bad = m.verdict === 'worse' || m.verdict === 'bad';
      if (m.marked === 'correct' && bad) add('marked-correct-engine-disagrees', m.key, m.point);
      else if (m.marked === 'wrong' && m.verdict === 'best') add('marked-wrong-engine-likes', m.key, m.point);
      else if (m.marked === null && bad) add('unmarked-engine-dislikes', m.key, m.point);
    }
  }
  // A position the tree ends at needs no more answers, and a move that is only as good as the tree's own adds nothing.
  const lead = nr.hasKids ? nr.missing.find((m) => m.beatsTree) : undefined;
  if (lead) add(nr.learner ? 'missing-move' : 'missing-reply', nr.key, lead.point);
}

function summarize(review: Review) {
  const divergence = review.findings.find((f) => DIVERGENCE.includes(f.kind));
  review.firstDivergence = divergence?.key ?? null;
  const judged = review.nodes.some((n) => n.learner && n.moves.some((m) => m.verdict !== null));
  if (divergence) review.verdict = 'diverges';
  else if (!judged || review.truncated) review.verdict = 'unjudged';
  else if (review.findings.some((f) => f.kind === 'missing-reply')) review.verdict = 'incomplete';
  else review.verdict = 'agrees';
}

/**
 * Marks the engine would put on a puzzle's learner moves: unmarked moves it likes as correct, and unmarked moves it
 * dislikes as wrong. Only a suggestion for the author to look at; it changes nothing.
 */
export function suggestedMarks(review: Review): { correct: string[]; wrong: string[] } {
  const correct: string[] = [];
  const wrong: string[] = [];
  for (const n of review.nodes) {
    if (!n.learner) continue;
    for (const m of n.moves) {
      if (m.marked !== null || m.verdict === null) continue;
      (isGood(m.verdict) ? correct : wrong).push(m.key);
    }
  }
  return { correct, wrong };
}
