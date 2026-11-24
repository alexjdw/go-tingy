import { type Color, type Dims, type SgfNode, isCorrectNode, isWrongNode, nodeMove } from '../sgf/parser';

/** A node of the puzzle's tree placed on a grid: `depth` is the column, `row` the line. */
export interface LayoutNode {
  node: SgfNode;
  depth: number;
  row: number;
  parent: LayoutNode | null;
  /** the color that played this move; null for the start position */
  color: Color | null;
  mark: 'correct' | 'wrong' | null;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  /** columns (the longest line, counting the start) and rows (lines) used */
  cols: number;
  rows: number;
  /** the placed node for a tree node */
  at: Map<SgfNode, LayoutNode>;
}

/**
 * Lay a tree out like a game record: a line of play runs along a row, and each variation drops to a row of its own
 * below the line it branches from. A node sits on its first child's row, so the main line stays on top.
 */
export function layoutTree(root: SgfNode, dims: Dims): TreeLayout {
  const nodes: LayoutNode[] = [];
  const at = new Map<SgfNode, LayoutNode>();
  let nextRow = 0;
  let cols = 1;
  const place = (node: SgfNode, depth: number, parent: LayoutNode | null): LayoutNode => {
    const entry: LayoutNode = {
      node,
      depth,
      row: 0,
      parent,
      color: nodeMove(node, dims)?.color ?? null,
      mark: isCorrectNode(node) ? 'correct' : isWrongNode(node) ? 'wrong' : null,
    };
    nodes.push(entry);
    at.set(node, entry);
    cols = Math.max(cols, depth + 1);
    if (!node.children.length) {
      entry.row = nextRow++;
    } else {
      node.children.forEach((c, i) => {
        const child = place(c, depth + 1, entry);
        if (i === 0) entry.row = child.row;
      });
    }
    return entry;
  };
  place(root, 0, null);
  return { nodes, cols, rows: Math.max(nextRow, 1), at };
}

/**
 * A short text that changes when the tree's moves or their correct / wrong marks change, so a screen that edits the
 * tree in place knows when to lay it out again (comments and labels do not matter to the picture).
 */
export function treeSignature(root: SgfNode): string {
  const out: string[] = [];
  const walk = (n: SgfNode) => {
    out.push(
      `${n.props.B?.[0] ?? ''}/${n.props.W?.[0] ?? ''}${isCorrectNode(n) ? '+' : ''}${isWrongNode(n) ? '-' : ''}(`,
    );
    n.children.forEach(walk);
    out.push(')');
  };
  walk(root);
  return out.join('');
}
