/**
 * SGF parser with a small "extended SGF" convention layer for training.
 *
 * Standard SGF is parsed into a tree of nodes. On top of that, training
 * semantics are derived from properties tools already emit:
 *   - Correct branch : TE[1] (tesuji), or comment starting with Correct/Right/Success
 *   - Wrong branch   : BM[1] (bad move), DO[1], or comment starting with Wrong/Incorrect/Failure
 *   - PL[B|W]        : player to move first (otherwise colour of first move in tree)
 *   - AB/AW/AE       : setup stones
 *   - C[]            : shown to the learner as an explanation
 *   - TR/SQ/CR/MA/LB : markup, rendered on the board
 * A leaf not marked wrong counts as success.
 */

export type Color = 'B' | 'W';

export interface SgfNode {
  props: Record<string, string[]>;
  children: SgfNode[];
  parent: SgfNode | null;
}

export interface Point {
  x: number;
  y: number;
}

export function parseSgf(text: string): SgfNode {
  let i = 0;
  const n = text.length;

  const skipWs = () => {
    while (i < n && /\s/.test(text[i])) i++;
  };

  function parseNodeProps(): Record<string, string[]> {
    const props: Record<string, string[]> = {};
    // after ';'
    for (;;) {
      skipWs();
      let ident = '';
      while (i < n && /[A-Za-z]/.test(text[i])) ident += text[i++];
      if (!ident) break;
      ident = ident.replace(/[a-z]/g, '');
      const values: string[] = [];
      for (;;) {
        skipWs();
        if (text[i] !== '[') break;
        i++;
        let v = '';
        while (i < n && text[i] !== ']') {
          if (text[i] === '\\') {
            i++;
            if (text[i] === '\r' || text[i] === '\n') {
              // soft line break: skip (and a following \n of \r\n)
              if (text[i] === '\r' && text[i + 1] === '\n') i++;
              i++;
              continue;
            }
          }
          v += text[i++];
        }
        i++; // ]
        values.push(v);
      }
      (props[ident] ??= []).push(...values);
    }
    return props;
  }

  /** Parses one "( ... )" game tree, returning its first node. */
  function parseTree(parent: SgfNode | null): SgfNode {
    skipWs();
    if (text[i] !== '(') throw new Error(`SGF: expected "(" at ${i}`);
    i++;
    let first: SgfNode | null = null;
    let cur: SgfNode | null = parent;
    for (;;) {
      skipWs();
      if (i >= n) throw new Error('SGF: unexpected end of input');
      const c = text[i];
      if (c === ';') {
        i++;
        const node: SgfNode = { props: parseNodeProps(), children: [], parent: cur };
        if (cur) cur.children.push(node);
        first ??= node;
        cur = node;
      } else if (c === '(') {
        if (!cur) throw new Error('SGF: variation before any node');
        parseTree(cur);
      } else if (c === ')') {
        i++;
        break;
      } else {
        throw new Error(`SGF: unexpected "${c}" at ${i}`);
      }
    }
    if (!first) throw new Error('SGF: empty game tree');
    return first;
  }

  skipWs();
  const start = text.indexOf('(', i);
  if (start < 0) throw new Error('SGF: no game tree found');
  i = start;
  return parseTree(null);
}

export function sgfToPoint(s: string, size: number): Point | null {
  if (s.length < 2) return null;
  const x = s.charCodeAt(0) - 97;
  const y = s.charCodeAt(1) - 97;
  if (x < 0 || y < 0 || x >= size || y >= size) return null; // pass ("tt" on <=19 boards also lands here)
  return { x, y };
}

/** Expand "aa:cc" compressed point lists as used by AB/AW/TR/etc. */
export function pointList(values: string[] | undefined, size: number): Point[] {
  const out: Point[] = [];
  for (const v of values ?? []) {
    if (v.includes(':')) {
      const [a, b] = v.split(':');
      const p1 = sgfToPoint(a, size);
      const p2 = sgfToPoint(b, size);
      if (!p1 || !p2) continue;
      for (let x = Math.min(p1.x, p2.x); x <= Math.max(p1.x, p2.x); x++)
        for (let y = Math.min(p1.y, p2.y); y <= Math.max(p1.y, p2.y); y++) out.push({ x, y });
    } else {
      const p = sgfToPoint(v, size);
      if (p) out.push(p);
    }
  }
  return out;
}

export function boardSize(root: SgfNode): number {
  const sz = parseInt(root.props.SZ?.[0] ?? '19', 10);
  return Number.isFinite(sz) && sz >= 2 && sz <= 25 ? sz : 19;
}

export function nodeMove(node: SgfNode, size: number): { color: Color; point: Point | null } | null {
  if (node.props.B) return { color: 'B', point: sgfToPoint(node.props.B[0], size) };
  if (node.props.W) return { color: 'W', point: sgfToPoint(node.props.W[0], size) };
  return null;
}

export const comment = (node: SgfNode): string => node.props.C?.join('\n') ?? '';

export function isWrongNode(node: SgfNode): boolean {
  if (node.props.BM || node.props.DO) return true;
  return /^\s*(wrong|incorrect|failure|fail)/i.test(comment(node));
}

export function isCorrectNode(node: SgfNode): boolean {
  if (node.props.TE) return true;
  return /^\s*(correct|right|success)/i.test(comment(node));
}

/** True if every path from this node ends in a wrong-marked node. */
export function leadsOnlyToFailure(node: SgfNode): boolean {
  if (isWrongNode(node)) return true;
  if (node.children.length === 0) return false;
  return node.children.every(leadsOnlyToFailure);
}

export function firstMoveColor(root: SgfNode): Color {
  const pl = root.props.PL?.[0];
  if (pl === 'B' || pl === 'W') return pl;
  let n: SgfNode | undefined = root;
  const size = boardSize(root);
  while (n) {
    const m = nodeMove(n, size);
    if (m) return m.color;
    n = n.children[0];
  }
  return 'B';
}

/** Every point touched by setup stones or any move anywhere in the tree. */
export function allPoints(root: SgfNode): Point[] {
  const size = boardSize(root);
  const pts: Point[] = [];
  const walk = (n: SgfNode) => {
    for (const key of ['AB', 'AW', 'AE']) pts.push(...pointList(n.props[key], size));
    const m = nodeMove(n, size);
    if (m?.point) pts.push(m.point);
    n.children.forEach(walk);
  };
  walk(root);
  return pts;
}

/**
 * Split an SGF collection (several top-level game trees, possibly in one file) into individual trees.
 * Parentheses inside [...] values are ignored. Empty input yields no trees; input with no "(" is returned
 * as a single chunk so the validator can report it.
 */
export function splitCollection(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inValue = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inValue) {
      if (c === '\\') i++;
      else if (c === ']') inValue = false;
      continue;
    }
    if (c === '[' && depth > 0) inValue = true;
    else if (c === '(') {
      if (depth === 0) {
        // A real tree starts "(;". Parentheses in a file's preamble text, like "(see http://…)", don't.
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] !== ';') continue;
        start = i;
      }
      depth++;
    } else if (c === ')' && depth > 0) {
      depth--;
      if (depth === 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  if (depth > 0 && start >= 0) out.push(text.slice(start)); // unterminated: validator will report it
  if (!out.length && text.trim()) out.push(text);
  return out;
}

/** Human coordinate like "D4" (columns skip I; rows count from the bottom). */
export const coordName = (p: Point, size: number) => `${'ABCDEFGHJKLMNOPQRSTUVWXYZ'[p.x]}${size - p.y}`;

export const pointToSgf =(p: Point) => String.fromCharCode(97 + p.x) + String.fromCharCode(97 + p.y);

/** True if this node or anything below it is explicitly marked correct (TE / "Correct" comment). */
export function containsCorrect(node: SgfNode): boolean {
  return isCorrectNode(node) || node.children.some(containsCorrect);
}

// ---------- serialization ----------
const esc = (v: string) => v.replace(/[\\\]]/g, '\\$&');
const nodeStr = (n: SgfNode) =>
  ';' +
  Object.entries(n.props)
    .filter(([, vs]) => vs.length)
    .map(([k, vs]) => k + vs.map((v) => `[${esc(v)}]`).join(''))
    .join('');
const seq = (n: SgfNode): string => {
  const s = nodeStr(n);
  if (n.children.length === 1) return s + seq(n.children[0]);
  return s + n.children.map((c) => `(${seq(c)})`).join('');
};
export const toSgf = (root: SgfNode) => `(${seq(root)})`;

// ---------- colour flipping ----------
const KEY_SWAP: Record<string, string> = { B: 'W', W: 'B', AB: 'AW', AW: 'AB' };
const swapWords = (s: string) =>
  s.replace(/\b(black|white)\b/gi, (m) => {
    const w = m.toLowerCase() === 'black' ? 'white' : 'black';
    return m[0] === m[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w;
  });

/** Swap black and white everywhere in the tree (stones, moves, PL, and colour words in comments). */
export function flipColors(root: SgfNode) {
  const walk = (n: SgfNode) => {
    const props: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(n.props)) {
      props[KEY_SWAP[k] ?? k] =
        k === 'PL' ? v.map((x) => (x === 'B' ? 'W' : x === 'W' ? 'B' : x)) : k === 'C' ? v.map(swapWords) : v;
    }
    n.props = props;
    n.children.forEach(walk);
  };
  walk(root);
}
