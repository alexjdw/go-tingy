import { Board } from '../go/board';
import {
  type Color,
  type SgfNode,
  boardSize,
  containsCorrect,
  coordName,
  firstMoveColor,
  isWrongNode,
  parseSgf,
  pointList,
  sgfToPoint,
} from './parser';

export interface Validation {
  errors: string[]; // blocking
  warnings: string[]; // importable, but worth knowing
  title?: string;
  size?: number;
  /** number of move nodes in the tree (all variations) */
  moves: number;
}

const MAX_ERRORS = 5;
const hasWrong = (n: SgfNode): boolean => isWrongNode(n) || n.children.some(hasWrong);

/** Checks that a single game tree is parseable, well-formed and playable by the study engine. */
export function validateSgf(text: string): Validation {
  const v: Validation = { errors: [], warnings: [], moves: 0 };
  const err = (m: string) => {
    if (v.errors.length < MAX_ERRORS && !v.errors.includes(m)) v.errors.push(m);
  };
  const warn = (m: string) => {
    if (!v.warnings.includes(m)) v.warnings.push(m);
  };

  let root: SgfNode;
  try {
    root = parseSgf(text);
  } catch (e) {
    err((e as Error).message);
    return v;
  }
  v.title = root.props.GN?.[0]?.trim() || undefined;

  const szRaw = root.props.SZ?.[0]?.trim();
  if (szRaw !== undefined) {
    const n = /^\d+$/.test(szRaw) ? parseInt(szRaw, 10) : NaN;
    if (!(n >= 2 && n <= 25)) {
      err(`Unsupported board size "${szRaw}" (square boards 2–25 only)`);
      return v;
    }
  }
  const size = boardSize(root);
  v.size = size;

  // Setup stones
  for (const key of ['AB', 'AW', 'AE']) {
    for (const val of root.props[key] ?? []) {
      for (const part of val.split(':')) {
        if (!sgfToPoint(part, size)) err(`${key} point "${part}" is outside the ${size}×${size} board`);
      }
    }
  }
  const ab = pointList(root.props.AB, size);
  const aw = pointList(root.props.AW, size);
  const abKeys = new Set(ab.map((p) => `${p.x},${p.y}`));
  for (const p of aw) if (abKeys.has(`${p.x},${p.y}`)) err(`Black and white setup stones overlap at ${coordName(p, size)}`);
  if (v.errors.length) return v;

  let setup = new Board(size);
  for (const p of ab) setup = setup.withStone(p, 'B');
  for (const p of aw) setup = setup.withStone(p, 'W');

  const walk = (n: SgfNode, board: Board) => {
    if (n.children.length > 1) {
      const colors = new Set(n.children.map((c) => (c.props.B ? 'B' : c.props.W ? 'W' : '?')));
      if (colors.size > 1) warn('A position has branches for both colors');
      const pts = n.children.map((c) => (c.props.B ?? c.props.W ?? [''])[0]);
      if (new Set(pts).size < pts.length) warn('A position has duplicate branches for the same move');
    }
    for (const c of n.children) {
      if (c.props.B && c.props.W) {
        err('A node has both a black and a white move');
        continue;
      }
      const color: Color | null = c.props.B ? 'B' : c.props.W ? 'W' : null;
      if (!color) {
        err('A node after the first has no move (setup is only supported in the first node)');
        continue;
      }
      const raw = c.props[color][0] ?? '';
      if (raw === '' || (raw === 'tt' && size <= 19)) {
        warn('Contains passes');
        const r = board.play(null, color);
        if (r) {
          v.moves++;
          walk(c, r.board);
        }
        continue;
      }
      const p = sgfToPoint(raw, size);
      if (!p) {
        err(`Move "${raw}" is outside the ${size}×${size} board`);
        continue;
      }
      const r = board.play(p, color);
      if (!r) {
        err(`Illegal ${color === 'B' ? 'black' : 'white'} move at ${coordName(p, size)} (occupied, suicide or ko)`);
        continue;
      }
      v.moves++;
      walk(c, r.board);
    }
  };
  walk(root, setup);

  if (v.moves === 0 && !v.errors.length) err('The game tree has no moves');
  if (!v.errors.length) {
    const pl = root.props.PL?.[0];
    if (pl && pl !== firstMoveColor({ ...root, props: { ...root.props, PL: [] } })) warn('PL (player to move) disagrees with the first move');
    if (!containsCorrect(root) && !hasWrong(root))
      warn('No branch is marked correct or wrong, so every line will count as correct');
  }
  return v;
}
