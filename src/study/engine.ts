import { type Board } from '../go/board';
import { initialBoard } from '../go/setup';
import { solutionKids } from './lines';
import type { Attempt } from '../progress/skill';
import type { Tri } from '../storage/settings';
import {
  type Color,
  type Dims,
  type OpenEdges,
  type Point,
  type SgfNode,
  boardDims,
  comment,
  containsCorrect,
  firstMoveColor,
  flipColors,
  isWrongNode,
  leadsOnlyToFailure,
  nodeMove,
  openEdges,
  parseSgf,
  pointList,
} from '../sgf/parser';

export type Mode = 'guided' | 'unguided' | 'explore';
export type Status = 'playing' | 'solved';
/**
 * replay: auto-playing up to the branching point; follow: the player clicks through the given moves (both colors)
 * on the green dot; mark: user marks good moves; play: normal solving
 */
export type Phase = 'replay' | 'follow' | 'mark' | 'play';

export interface EngineOptions {
  markChoices?: Tri;
  flipColors?: Tri;
  rng?: () => number;
  /**
   * Guided mastery: before the player moves, play this many of the learner's moves (and the opponent's
   * replies) along a correct line. The rest of the puzzle is solved normally. Such a run is not tracked as an
   * ordinary unguided attempt.
   */
  freeMoves?: number;
  /** With `freeMoves`: the player clicks through the given moves, for both sides, instead of watching them. */
  follow?: boolean;
  /** Mastery runs: choose the opponent's reply from the candidates (instead of at random). */
  chooseReply?: (node: SgfNode, candidates: SgfNode[]) => SgfNode | null;
  /** Mastery runs: refuse a correct move that leads only to lines already solved. */
  acceptMove?: (child: SgfNode) => boolean;
  /**
   * Joseki mode: which side the player takes. 'first' (the default) plays the puzzle's first color. 'second' plays
   * the other color: the first move is played for you, then you answer it.
   */
  side?: 'first' | 'second';
  /** Use this color flipping instead of choosing one (so a joseki's second side matches its first). */
  flipped?: boolean;
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
  dims!: Dims;
  /** Sides drawn without a border (display only). */
  open!: OpenEdges;
  playerColor!: Color;
  /** the color that plays first in the puzzle (the player, unless they have the second side) */
  firstColor!: Color;
  snap!: Snapshot;
  flipped = false;
  phase: Phase = 'play';
  /** Points the user has marked as candidate good moves (mark phase). */
  marks: Point[] = [];
  mistakes = 0;
  /** Count of stones placed; bumps on every placement (drives the stone animation). */
  placed = 0;
  hasMarkPhase = false;
  /** Learner moves actually played for free at the start (guided mastery). */
  freeMovesPlayed = 0;

  private history: Snapshot[] = [];
  private afterReplay: 'mark' | 'play' = 'mark';
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
    this.flipped = this.mode !== 'explore' && (this.opts.flipped ?? this.resolve(this.opts.flipColors));
    if (this.flipped) flipColors(this.root);
    this.dims = boardDims(this.root);
    this.open = openEdges(this.root);
    this.firstColor = firstMoveColor(this.root);
    this.playerColor = this.opts.side === 'second' ? other(this.firstColor) : this.firstColor;
    this.anyExplicit = containsCorrect(this.root);
    this.history = [];
    this.mistakes = 0;
    this.placed = 0;
    this.marks = [];
    this.plan = [];
    this.planIdx = 0;
    this.phase = 'play';
    this.hasMarkPhase = false;
    this.freeMovesPlayed = 0;
    this.afterReplay = 'mark';
    this.snap = this.initial();
    const free = this.opts.freeMoves ?? 0;
    const second = this.opts.side === 'second' && this.mode !== 'explore';
    // the other side of a joseki starts with the first move played for you (and any free moves after it)
    const lead = second ? (this.mode === 'unguided' && free > 0 ? this.freePlan(free) : []) : [];
    const opening = second && !lead.length ? this.openingMove() : null;
    const given = this.opts.follow ? 'follow' : 'replay';
    if (second && (lead.length || opening)) {
      this.plan = lead.length ? lead : [opening!];
      this.phase = lead.length ? given : 'replay';
      this.afterReplay = 'play';
    } else if (this.mode === 'unguided' && free > 0) {
      const plan = this.freePlan(free);
      if (plan.length) {
        this.plan = plan;
        this.phase = given;
        this.afterReplay = 'play';
      }
    } else if (this.mode === 'unguided' && this.resolve(this.opts.markChoices)) {
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
    const board = initialBoard(this.root, this.dims);
    return { board, node: this.root, toPlay: this.firstColor, last: null, status: 'playing', message: '' };
  }

  /** The first move of a correct line, for the player who takes the second side; null if there is no reply to play. */
  private openingMove(): SgfNode | null {
    const kids = solutionKids(this.root, this.dims, this.firstColor).filter((k) => k.children.length > 0);
    if (!kids.length) return null;
    return this.opts.chooseReply?.(this.root, kids) ?? kids[Math.floor(this.rng() * kids.length)];
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
      const m = good[0] && nodeMove(good[0], this.dims);
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
    return labelled.map(([pt]) => pointList([pt], this.dims)[0]).filter(Boolean);
  }

  // ---------- replay + mark phases ----------

  /** The point the player should click next while following the given moves (the green dot). */
  followHint(): Point | null {
    if (this.phase !== 'follow') return null;
    const node = this.plan[this.planIdx];
    return (node && nodeMove(node, this.dims)?.point) || null;
  }

  /** Follow phase: clicking the green dot plays the next given move, whoever's it is; anything else is ignored. */
  follow(p: Point): 'ok' | 'wrong' {
    const want = this.followHint();
    if (!want || !same(want, p)) return 'wrong';
    this.step();
    return 'ok';
  }

  /** Advance the replay by one move. Returns true if a move was played. */
  replayStep(): boolean {
    if (this.phase !== 'replay') return false;
    return this.step();
  }

  private step(): boolean {
    const node = this.plan[this.planIdx++];
    const m = node && nodeMove(node, this.dims);
    const s = this.snap;
    let board = s.board;
    if (m) {
      const r = board.play(m.point, m.color);
      if (r) board = r.board;
      this.placed++;
    }
    this.snap = {
      board,
      node,
      toPlay: m ? other(m.color) : s.toPlay,
      last: m?.point ?? null,
      status: 'playing',
      message: '',
    };
    if (this.planIdx >= this.plan.length) {
      if (this.afterReplay === 'mark') this.enterMark();
      else this.enterPlay();
    }
    return !!m;
  }

  private enterPlay() {
    this.phase = 'play';
    this.snap = { ...this.snap, message: '' };
  }

  /**
   * A random correct line, cut after the `k`th learner move and the opponent's reply to it, leaving at least
   * one learner move for the player. Shorter lines give fewer free moves.
   */
  private freePlan(k: number): SgfNode[] {
    const line: SgfNode[] = [];
    for (let n = this.root; ;) {
      const kids = solutionKids(n, this.dims, this.playerColor);
      if (!kids.length) break;
      n = kids[Math.floor(this.rng() * kids.length)];
      line.push(n);
    }
    const isLearner = (c: SgfNode) => nodeMove(c, this.dims)?.color === this.playerColor;
    const free = Math.min(k, line.filter(isLearner).length - 1);
    if (free <= 0) return [];
    let end = 0;
    for (let i = 0, seen = 0; i < line.length; i++) {
      if (isLearner(line[i]) && ++seen === free) {
        end = i + 1;
        break;
      }
    }
    if (end < line.length && !isLearner(line[end])) end++; // the reply, so it is the learner's turn
    this.freeMovesPlayed = free;
    return line.slice(0, end);
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
      .map((c) => nodeMove(c, this.dims))
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
      const m = nodeMove(c, this.dims);
      if (m?.point) out.push(m.point);
    }
    return out;
  }

  markup(): Markup[] {
    const node = this.snap.node;
    if (!node) return [];
    const out: Markup[] = [];
    for (const kind of ['TR', 'SQ', 'CR', 'MA'] as const)
      for (const point of pointList(node.props[kind], this.dims)) out.push({ kind, point });
    for (const v of node.props.LB ?? []) {
      const [pt, label] = v.split(':');
      const point = pointList([pt], this.dims)[0];
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
      if (nodeMove(next, this.dims)?.color === this.playerColor) depth++;
      n = next;
    }
    return 6000 + 5000 * Math.max(1, depth) + (this.hasMarkPhase ? 6000 : 0);
  }

  // ---------- playing ----------

  private pickReply(node: SgfNode): SgfNode | null {
    const good = node.children.filter((c) => !leadsOnlyToFailure(c));
    const pool = good.length ? good : node.children;
    if (!pool.length) return null;
    if (this.opts.chooseReply) return this.opts.chooseReply(node, pool);
    return pool[Math.floor(this.rng() * pool.length)];
  }

  /**
   * Play at a point. Returns 'illegal' | 'wrong' | 'ok' | 'solved', or 'redundant' when a mastery run
   * refuses a correct move that only leads to lines already solved (no mistake, nothing played).
   */
  play(p: Point): 'illegal' | 'wrong' | 'ok' | 'solved' | 'redundant' {
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
      const m = nodeMove(c, this.dims);
      return m?.point && same(m.point, p) && m.color === s.toPlay;
    });
    if (!match || leadsOnlyToFailure(match)) {
      this.mistakes++;
      const why = match ? comment(match) : '';
      this.snap = { ...s, message: why || 'Not the move — try again.' };
      return 'wrong';
    }
    if (this.opts.acceptMove && !this.opts.acceptMove(match)) {
      this.snap = { ...s, message: 'Correct, but you already solved that line. Find another correct move.' };
      return 'redundant';
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
    const m = reply && nodeMove(reply, this.dims);
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
      const m = nodeMove(c, this.dims);
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

  /**
   * Only plain unguided attempts count toward skill; guided and explore are free practice, and guided mastery
   * runs (which set `freeMoves`) are scored by the mastery system instead.
   */
  get tracksSkill() {
    return this.mode === 'unguided' && this.opts.freeMoves === undefined;
  }

  /**
   * The outcome of an unguided attempt, for skill tracking. Any mistake makes it a failed attempt, even if
   * the learner eventually plays the whole solution.
   */
  attempt(elapsedMs: number): Attempt {
    return { correct: this.mistakes === 0, ms: elapsedMs, parMs: this.parMs(), at: Date.now() };
  }
}

/** Can a puzzle be played from the second side too (joseki mode)? It needs a first move that has a reply. */
export function hasSecondSide(sgf: string): boolean {
  try {
    const root = parseSgf(sgf);
    return solutionKids(root, boardDims(root), firstMoveColor(root)).some((k) => k.children.length > 0);
  } catch {
    return false;
  }
}
