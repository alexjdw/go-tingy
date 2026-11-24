import {
  type Color,
  type Dims,
  type SgfNode,
  boardDims,
  containsCorrect,
  firstMoveColor,
  isWrongNode,
  leadsOnlyToFailure,
  nodeMove,
  parseSgf,
} from '../sgf/parser';

/** Upper bound on the lines tracked for one puzzle (a runaway tree shouldn't make a timed run endless). */
export const MAX_LINES = 200;

/**
 * The children of `node` that belong to the solution: everything not marked wrong. If only wrong-marked
 * replies exist and it is the opponent's turn, the engine plays them anyway, so they count too. This mirrors
 * how the study engine picks replies.
 */
export function solutionKids(node: SgfNode, dims: Dims, player: Color): SgfNode[] {
  const good = node.children.filter((c) => !leadsOnlyToFailure(c));
  if (good.length) return good;
  const first = node.children[0] && nodeMove(node.children[0], dims);
  return first && first.color !== player ? node.children : [];
}

/**
 * A node's identity that is stable across separate parses of the same SGF: the moves from the root, e.g.
 * "B:cc;W:dd". The root is "".
 */
export function nodeKey(node: SgfNode): string {
  const parts: string[] = [];
  for (let n: SgfNode | null = node; n && n.parent; n = n.parent) {
    const color = n.props.B ? 'B' : n.props.W ? 'W' : '?';
    parts.push(`${color}:${(n.props.B ?? n.props.W ?? [''])[0]}`);
  }
  return parts.reverse().join(';');
}

/** Is `leaf` at or below the node with key `key`? */
export const isUnder = (leaf: string, key: string) => key === '' || leaf === key || leaf.startsWith(key + ';');

export interface LineSet {
  /** keys of the final nodes of each line, in tree order */
  leaves: string[];
  /** true if the tree had more than MAX_LINES lines and the rest are not tracked */
  truncated: boolean;
  /** most moves the learner makes along any single line */
  maxLearnerMoves: number;
}

/** Every complete line: a root-to-leaf path through nodes that are part of the solution. */
export function enumerateLines(root: SgfNode, dims: Dims, player: Color, cap = MAX_LINES): LineSet {
  const leaves: string[] = [];
  let truncated = false;
  let maxLearnerMoves = 0;
  const walk = (n: SgfNode, learnerMoves: number) => {
    if (leaves.length >= cap) {
      truncated = true;
      return;
    }
    if (n.children.length === 0) {
      if (n.parent) {
        leaves.push(nodeKey(n));
        maxLearnerMoves = Math.max(maxLearnerMoves, learnerMoves);
      }
      return;
    }
    for (const c of solutionKids(n, dims, player)) {
      walk(c, learnerMoves + (nodeMove(c, dims)?.color === player ? 1 : 0));
    }
  };
  walk(root, 0);
  return { leaves, truncated, maxLearnerMoves };
}

/** Parse an SGF and enumerate its lines. */
export function linesOf(sgf: string): LineSet {
  const root = parseSgf(sgf);
  return enumerateLines(root, boardDims(root), firstMoveColor(root));
}

/**
 * How many moves the learner makes along the longest line. This is the "length" that sizes the guided
 * learning steps. 0 for a puzzle with no solution line.
 */
export const learnerDepth = (sgf: string) => linesOf(sgf).maxLearnerMoves;

const depthCache = new Map<string, number>();

/** `learnerDepth` remembered per SGF (and 0 for one that cannot be read): tiles ask for it on every redraw. */
export function cachedLearnerDepth(sgf: string): number {
  let d = depthCache.get(sgf);
  if (d === undefined) {
    try {
      d = learnerDepth(sgf);
    } catch {
      d = 0;
    }
    depthCache.set(sgf, d);
  }
  return d;
}

/**
 * The branch to follow when stepping forward through a tree: one that leads to a move marked correct, else one that
 * does not lead only to failure, else the first. Null where the tree ends.
 */
export function preferredChild(node: SgfNode): SgfNode | null {
  const kids = node.children;
  return (
    kids.find((c) => !isWrongNode(c) && containsCorrect(c)) ??
    kids.find((c) => !leadsOnlyToFailure(c)) ??
    kids[0] ??
    null
  );
}
