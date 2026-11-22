import { Board } from '../go/board';
import type { Attempt } from '../progress/skill';
import type { Tri } from '../storage/settings';
import {
  type Color,
  type Point,
  type SgfNode,
  boardSize,
  comment,
  containsCorrect,
  firstMoveColor,
  flipColors,
  isWrongNode,
  leadsOnlyToFailure,
  nodeMove,
  parseSgf,
  pointList,
} from '../sgf/parser';

export type Mode = 'guided' | 'unguided' | 'explore';
export type Status = 'playing' | 'solved';
/** replay: auto-playing up to the branching point; mark: user marks good moves; play: normal solving */
export type Phase = 'replay' | 'mark' | 'play';

export interface EngineOptions {
  markChoices?: Tri;
  flipColors?: Tri;
  rng?: () => number;
}

export interface Markup {
  kind: 'TR' | 'SQ' | 'CR' | 'MA' | 'LB';
  point: Point;
  label?: string;
}

export interface Snapshot {
  board: Board;
  /** Current tree node, or null when the user has left the SGF's variations (explore only). */
  node: SgfNode | null;
  toPlay: Color;
  last: Point | null;
  status: Status;
  message: string;
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const other = (c: Color): Color => (c === 'B' ? 'W' : 'B');

export class StudyEngine {
  root!: SgfNode;
  size!: number;
  playerColor!: Color;
  snap!: Snapshot;
  flipped = false;
  phase: Phase = 'play';
  /** Points the user has marked as candidate good moves (mark phase). */
  marks: Point[] = [];
  mistakes = 0;
  /** Count of stones placed; bumps on every placement (drives the stone animation). */
  placed = 0;
  hasMarkPhase = false;

  private history: Snapshot[] = [];
  private plan: SgfNode[] = [];
  private planIdx = 0;
  private anyExplicit = false;
  private rng: () => number;

  constructor(
    private sgf: string,
    readonly mode: Mode,
    private opts: EngineOptions = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.setup();
  }

  private resolve(t: Tri | undefined) {
    return t === 'on' ? true : t === 'random' ? this.rng() < 0.5 : false;
  }

  private setup() {
    this.root = parseSgf(this.sgf);
    this.flipped = this.mode !== 'explore' && this.resolve(this.opts.flipColors);
    if (this.flipped) flipColors(this.root);
    this.size = boardSize(this.root);
    this.playerColor = firstMoveColor(this.root);
    this.anyExplicit = containsCorrect(this.root);
    this.history = [];
    this.mistakes = 0;
    this.placed = 0;
    this.marks = [];
    this.plan = [];
    this.planIdx = 0;
    this.phase = 'play';
    this.hasMarkPhase = false;
    this.snap = this.initial();
    if (this.mode === 'unguided' && this.resolve(this.opts.markChoices)) {
      const path = this.findChoicePath();
      if (path) {
        this.plan = path;
        this.phase = 'replay';
        this.hasMarkPhase = true;
        if (!path.length) this.enterMark();
      }
    }
  }

  private initial(): Snapshot {
    let board = new Board(this.size);
    for (const p of pointList(this.root.props.AE, this.size)) board = board.withStone(p, null);
    for (const p of pointList(this.root.props.AB, this.size)) board = board.withStone(p, 'B');
    for (const p of pointList(this.root.props.AW, this.size)) board = board.withStone(p, 'W');
    return { board, node: this.root, toPlay: this.playerColor, last: null, status: 'playing', message: '' };
  }

  reset() {
    this.setup();
  }

  // ---------- correctness ----------

  /**
   * A move counts as a good choice if anything in its subtree is marked correct. If the problem has no
   * explicit correct marks at all, fall back to "doesn't lead only to failure".
   */
  private isGood(c: SgfNode): boolean {
    if (isWrongNode(c)) return false;
    return containsCorrect(c) || (!this.anyExplicit && !leadsOnlyToFailure(c));
  }

  private goodChildren(n: SgfNode): SgfNode[] {
    return n.children.filter((c) => this.isGood(c));
  }

  /** Path (excluding root) to a random learner-turn node that has 2+ good choices, or null. */
  private findChoicePath(): SgfNode[] | null {
    const cands: SgfNode[][] = [];
    const walk = (n: SgfNode, path: SgfNode[]) => {
      const good = this.goodChildren(n);
      const m = good[0] && nodeMove(good[0], this.size);
      if (m && m.color === this.playerColor && good.length >= 2) cands.push(path);
      for (const c of good) walk(c, [...path, c]);
    };
    walk(this.root, []);
    return cands.length ? cands[Math.floor(this.rng() * cands.length)] : null;
  }

  // ---------- multiple choice (A/B/C labels) ----------

  /** Lettered points at the current node; when present (and it's the learner's turn) only these may be played. */
  choicePoints(): Point[] {
    const s = this.snap;
    if (!s.node || s.toPlay !== this.playerColor) return [];
    const labelled = (s.node.props.LB ?? []).map((v) => v.split(':')).filter(([, l]) => /^[A-Z]$/.test(l ?? ''));
    if (labelled.length < 2) return [];
    return labelled.map(([pt]) => pointList([pt], this.size)[0]).filter(Boolean);
  }

  // ---------- replay + mark phases ----------

  /** Advance the replay by one move. Returns true if a move was played. */
  replayStep(): boolean {
    if (this.phase !== 'replay') return false;
    const node = this.plan[this.planIdx++];
    const m = node && nodeMove(node, this.size);
    const s = this.snap;
    let board = s.board;
    if (m) {
      const r = board.play(m.point, m.color);
      if (r) board = r.board;
      this.placed++;
    }
    this.snap = { board, node, toPlay: m ? other(m.color) : s.toPlay, last: m?.point ?? null, status: 'playing', message: '' };
    if (this.planIdx >= this.plan.length) this.enterMark();
    return !!m;
  }

  private enterMark() {
    this.phase = 'mark';
    this.snap = { ...this.snap, message: 'Mark every move that could be correct, then submit.' };
  }

  toggleMark(p: Point): boolean {
    if (this.phase !== 'mark' || this.snap.board.get(p)) return false;
    const cp = this.choicePoints();
    if (cp.length && !cp.some((q) => same(q, p))) return false;
    this.marks = this.marks.some((m) => same(m, p)) ? this.marks.filter((m) => !same(m, p)) : [...this.marks, p];
    return true;
  }

  /** Check marks against the good moves. All must be marked, and nothing else. */
  submitMarks(): 'ok' | 'wrong' {
    const node = this.snap.node!;
    const want = this.goodChildren(node)
      .map((c) => nodeMove(c, this.size))
      .filter((m) => m && m.color === this.playerColor && m.point)
      .map((m) => m!.point!);
    const ok = want.length === this.marks.length && want.every((w) => this.marks.some((m) => same(m, w)));
    if (ok) {
      this.phase = 'play';
      this.marks = [];
      this.snap = { ...this.snap, message: 'Right — those are all the good moves. Now choose one and play it.' };
      return 'ok';
    }
    this.mistakes++;
    this.snap = { ...this.snap, message: 'Not quite — a marked move is wrong, or a good move is missing.' };
    return 'wrong';
  }

  // ---------- history ----------

  get canUndo() {
    return this.phase === 'play' && this.history.length > 0;
  }

  undo() {
    if (!this.canUndo) return;
    let prev = this.history.pop()!;
    if (this.mode !== 'explore') {
      // rewind to before the learner's last move, skipping the opponent's reply
      while (prev.toPlay !== this.playerColor && this.history.length) prev = this.history.pop()!;
    }
    this.snap = prev;
  }

  private commit(next: Snapshot) {
    if (next.last) this.placed++;
    this.history.push(this.snap);
    this.snap = next;
  }

  // ---------- queries ----------

  /** Points of good continuations from the current node (guided hints / explore book moves). */
  bookMoves(): Point[] {
    const node = this.snap.node;
    if (!node) return [];
    const out: Point[] = [];
    for (const c of node.children) {
      if (this.mode !== 'explore' && leadsOnlyToFailure(c)) continue;
      const m = nodeMove(c, this.size);
      if (m?.point) out.push(m.point);
    }
    return out;
  }

  markup(): Markup[] {
    const node = this.snap.node;
    if (!node) return [];
    const out: Markup[] = [];
    for (const kind of ['TR', 'SQ', 'CR', 'MA'] as const)
      for (const point of pointList(node.props[kind], this.size)) out.push({ kind, point });
    for (const v of node.props.LB ?? []) {
      const [pt, label] = v.split(':');
      const point = pointList([pt], this.size)[0];
      if (point) out.push({ kind: 'LB', point, label });
    }
    return out;
  }

  comment(): string {
    return this.snap.node ? comment(this.snap.node) : '';
  }

  /** Expected par time (ms) for the speed score: grows with solution length. */
  parMs(): number {
    let depth = 0;
    let n: SgfNode | undefined = this.root;
    while (n) {
      const next: SgfNode | undefined = n.children.find((c) => !leadsOnlyToFailure(c));
      if (!next) break;
      if (nodeMove(next, this.size)?.color === this.playerColor) depth++;
      n = next;
    }
    return 6000 + 5000 * Math.max(1, depth) + (this.hasMarkPhase ? 6000 : 0);
  }

  // ---------- playing ----------

  private pickReply(node: SgfNode): SgfNode | null {
    const good = node.children.filter((c) => !leadsOnlyToFailure(c));
    const pool = good.length ? good : node.children;
    return pool.length ? pool[Math.floor(this.rng() * pool.length)] : null;
  }

  /** Play at a point. Returns 'illegal' | 'wrong' | 'ok' | 'solved'. */
  play(p: Point): 'illegal' | 'wrong' | 'ok' | 'solved' {
    const s = this.snap;
    if (s.status === 'solved' || this.phase !== 'play') return 'illegal';
    if (this.mode === 'explore') return this.playExplore(p);

    if (this.mode === 'unguided') {
      const cp = this.choicePoints();
      if (cp.length && !cp.some((q) => same(q, p))) {
        this.snap = { ...s, message: 'Choose one of the lettered points.' };
        return 'illegal';
      }
    }

    const node = s.node!;
    const res = s.board.play(p, s.toPlay);
    if (!res) return 'illegal';
    const match = node.children.find((c) => {
      const m = nodeMove(c, this.size);
      return m?.point && same(m.point, p) && m.color === s.toPlay;
    });
    if (!match || leadsOnlyToFailure(match)) {
      this.mistakes++;
      const why = match ? comment(match) : '';
      this.snap = { ...s, message: why || 'Not the move — try again.' };
      return 'wrong';
    }
    const opp = other(s.toPlay);
    let board = res.board;
    let cur = match;
    let msg = comment(match);
    this.commit({ board, node: cur, toPlay: opp, last: p, status: 'playing', message: msg });
    if (cur.children.length === 0) {
      this.snap = { ...this.snap, status: 'solved', message: msg || 'Correct!' };
      return 'solved';
    }
    const reply = this.pickReply(cur);
    const m = reply && nodeMove(reply, this.size);
    if (reply && m) {
      const r = board.play(m.point, m.color);
      if (r) {
        board = r.board;
        cur = reply;
        msg = [msg, comment(reply)].filter(Boolean).join('\n');
        this.commit({ board, node: cur, toPlay: this.playerColor, last: m.point, status: 'playing', message: msg });
      }
    }
    if (cur.children.length === 0) {
      this.snap = { ...this.snap, status: 'solved', message: msg || 'Correct!' };
      return 'solved';
    }
    return 'ok';
  }

  private playExplore(p: Point): 'illegal' | 'ok' {
    const s = this.snap;
    const res = s.board.play(p, s.toPlay);
    if (!res) return 'illegal';
    const match = s.node?.children.find((c) => {
      const m = nodeMove(c, this.size);
      return m?.point && same(m.point, p) && m.color === s.toPlay;
    });
    this.commit({
      board: res.board,
      node: match ?? null,
      toPlay: other(s.toPlay),
      last: p,
      status: 'playing',
      message: match ? comment(match) : s.node ? 'Off the book — free play.' : '',
    });
    return 'ok';
  }

  pass() {
    if (this.mode !== 'explore') return;
    const s = this.snap;
    this.commit({ ...s, node: null, toPlay: other(s.toPlay), last: null, message: '' });
  }

  /** Only unguided attempts count toward skill; guided and explore are free practice. */
  get tracksSkill() {
    return this.mode === 'unguided';
  }

  /**
   * The outcome of an unguided attempt, for skill tracking. Any mistake makes it a failed attempt, even if
   * the learner eventually plays the whole solution.
   */
  attempt(elapsedMs: number): Attempt {
    return { correct: this.mistakes === 0, ms: elapsedMs, parMs: this.parMs(), at: Date.now() };
  }
}
