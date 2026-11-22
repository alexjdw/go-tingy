import { type SgfNode, boardSize, nodeMove, parseSgf, pointList, toSgf } from './parser';

export interface Prepared {
  sgf: string;
  /** Human-readable notes about what was changed or assumed; shown as warnings on import. */
  notes: string[];
}

const ADDITIVE = new Set(['AB', 'AW', 'AE']);
const SETUP_ONLY = new Set(['AB', 'AW', 'AE', 'PL', 'C', 'GM', 'FF', 'SZ', 'GN']);
const PLAYER: Record<string, 'B' | 'W'> = { '1': 'B', b: 'B', black: 'B', '2': 'W', w: 'W', white: 'W' };

/**
 * Bring older / collection-style SGF into the shape the study engine expects. Returns the original text
 * untouched when nothing needed changing.
 *
 *  - Setup in a later node (FF[3] style: `(;SZ[19];AW[..]AB[..]PL[2];W[..]...)`) is merged into the root.
 *  - `PL[1]` / `PL[2]` (and lowercase / words) become `PL[B]` / `PL[W]`.
 *  - A move carrying a triangle on its own point (`;B[br]TR[br]`) is how uliGo-style problem files mark
 *    wrong answers, so those branches get `BM[1]`.
 */
export function prepareSgf(text: string): Prepared {
  let root: SgfNode;
  try {
    root = parseSgf(text);
  } catch {
    return { sgf: text, notes: [] }; // let the validator report the parse error
  }
  const notes: string[] = [];
  let changed = false;

  // 1. Merge leading setup-only / empty nodes into the root.
  let merged = 0;
  while (root.children.length === 1) {
    const c = root.children[0];
    if (c.props.B || c.props.W) break;
    if (!Object.keys(c.props).every((k) => SETUP_ONLY.has(k))) break;
    for (const [k, v] of Object.entries(c.props)) root.props[k] = ADDITIVE.has(k) ? [...(root.props[k] ?? []), ...v] : v;
    root.children = c.children;
    for (const g of c.children) g.parent = root;
    merged++;
  }
  if (merged) {
    changed = true;
    notes.push('Moved setup stones from a later node into the first node (old SGF style)');
  }

  // 2. Player to move.
  const pl = root.props.PL?.[0]?.trim().toLowerCase();
  if (pl && PLAYER[pl] && root.props.PL[0] !== PLAYER[pl]) {
    root.props.PL = [PLAYER[pl]];
    changed = true;
  }

  // 3. Triangle on the move = wrong answer.
  const size = boardSize(root);
  let wrong = 0;
  const walk = (n: SgfNode) => {
    for (const c of n.children) {
      const m = nodeMove(c, size);
      if (m?.point && !c.props.BM && !c.props.TE && pointList(c.props.TR, size).some((p) => p.x === m.point!.x && p.y === m.point!.y)) {
        c.props.BM = ['1'];
        wrong++;
      }
      walk(c);
    }
  };
  walk(root);
  if (wrong) {
    changed = true;
    notes.push(`${wrong} branch${wrong > 1 ? 'es' : ''} with a triangle on the move treated as wrong (uliGo convention)`);
  }

  return { sgf: changed ? toSgf(root) : text, notes };
}
