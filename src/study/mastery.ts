/**
 * A mastery run: solve every line of a puzzle, in random order, as fast as you can.
 *
 *  - A "line" is one complete solution path (see lines.ts). Each round presents the puzzle from the start,
 *    aimed at a random line that hasn't been solved yet; the opponent's replies steer toward it.
 *  - A round ends on success or on the first mistake, and the puzzle then resets. A failed line goes back in
 *    the pool and must be solved cleanly later.
 *  - The run ends when every line has been solved. Score: correct moves per minute (+1 per correct click,
 *    including clicks in failed rounds), halved for every mistake.
 *  - If a puzzle has several correct first moves (or other learner choices), any correct move is accepted, but
 *    one that only leads into already-solved lines is refused without penalty so the other lines get found.
 */
import { type MasteryResult, masteryLevel, masteryScore } from '../progress/mastery';
import { type Point, type SgfNode, boardDims, firstMoveColor, parseSgf } from '../sgf/parser';
import { StudyEngine, hasSecondSide } from './engine';
import { enumerateLines, isUnder, nodeKey } from './lines';

export type RunPhase = 'ready' | 'playing' | 'between' | 'done';
export type RoundOutcome = 'success' | 'fail';

export interface MasteryRunOptions {
  rng?: () => number;
  /** clock, in ms; injectable for tests */
  now?: () => number;
  /** joseki mode: every line must be solved from both sides */
  joseki?: boolean;
}

export class MasteryRun {
  /** lines that must be solved */
  readonly totalLines: number;
  /** the puzzle had more lines than are tracked */
  readonly truncated: boolean;
  /** every line is played from both sides */
  readonly bothSides: boolean;
  moves = 0;
  mistakes = 0;
  /** rounds started so far, including failed ones */
  rounds = 0;
  phase: RunPhase = 'ready';
  /** how the last round ended (while `phase` is 'between' or 'done') */
  lastOutcome: RoundOutcome | null = null;
  engine!: StudyEngine;

  /** what must be solved: `first|<line>` and, for a joseki, `second|<line>` */
  private readonly leaves: string[];
  private readonly solved = new Set<string>();
  private target = '';
  private side: 'first' | 'second' = 'first';
  private startedAt = 0;
  private finishedAt = 0;
  private readonly rng: () => number;
  private readonly now: () => number;

  constructor(
    private sgf: string,
    opts: MasteryRunOptions = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? Date.now;
    const root = parseSgf(sgf);
    const set = enumerateLines(root, boardDims(root), firstMoveColor(root));
    const two = !!opts.joseki && hasSecondSide(sgf);
    // a line of one move has nothing to play from the second side
    this.bothSides = two;
    this.leaves = [
      ...set.leaves.map((l) => `first|${l}`),
      ...(two ? set.leaves.filter((l) => l.includes(';')).map((l) => `second|${l}`) : []),
    ];
    this.truncated = set.truncated;
    this.totalLines = this.leaves.length;
    this.engine = this.makeEngine();
  }

  get solvedLines() {
    return this.solved.size;
  }

  /** Start the clock and the first round. */
  start() {
    if (this.phase !== 'ready' || this.totalLines === 0) return;
    this.startedAt = this.now();
    this.newRound();
  }

  /** Play a point in the current round. */
  play(p: Point): ReturnType<StudyEngine['play']> {
    if (this.phase !== 'playing') return 'illegal';
    const r = this.engine.play(p);
    if (r === 'ok' || r === 'solved') this.moves++;
    if (r === 'wrong') {
      this.mistakes++;
      this.lastOutcome = 'fail';
      this.phase = 'between';
    } else if (r === 'solved') {
      this.lastOutcome = 'success';
      const leaf = this.engine.snap.node ? nodeKey(this.engine.snap.node) : '';
      const key = `${this.side}|${leaf}`;
      if (this.leaves.includes(key)) this.solved.add(key);
      if (this.solved.size >= this.totalLines) {
        this.finishedAt = this.now();
        this.phase = 'done';
      } else this.phase = 'between';
    }
    return r;
  }

  /** After a round ends (success or fail), reset the puzzle for the next line. */
  advance() {
    if (this.phase === 'between') this.newRound();
  }

  elapsedMs(): number {
    if (this.phase === 'ready') return 0;
    return (this.phase === 'done' ? this.finishedAt : this.now()) - this.startedAt;
  }

  /** The score so far (final once the run is done). */
  score(): number {
    return masteryScore({ moves: this.moves, ms: this.elapsedMs(), mistakes: this.mistakes });
  }

  result(): MasteryResult {
    const score = this.score();
    return {
      score,
      level: masteryLevel(score),
      moves: this.moves,
      mistakes: this.mistakes,
      ms: this.elapsedMs(),
      lines: this.totalLines,
      at: this.now(),
    };
  }

  // ---------- rounds ----------

  /** unsolved lines under a node, for the side being played */
  private unsolvedUnder(key: string): number {
    const prefix = `${this.side}|`;
    return this.leaves.filter(
      (l) => l.startsWith(prefix) && !this.solved.has(l) && isUnder(l.slice(prefix.length), key),
    ).length;
  }

  private pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rng() * xs.length)];
  }

  private makeEngine() {
    return new StudyEngine(this.sgf, 'unguided', {
      rng: this.rng,
      side: this.side,
      // steer the opponent toward the target line, else toward any unsolved line
      chooseReply: (_node: SgfNode, cands: SgfNode[]) => {
        const onTarget = cands.filter((c) => isUnder(this.target, nodeKey(c)));
        if (onTarget.length) return this.pick(onTarget);
        const open = cands.filter((c) => this.unsolvedUnder(nodeKey(c)) > 0);
        return this.pick(open.length ? open : cands);
      },
      // a correct move into already-solved lines is refused, unless nothing is left unsolved anywhere
      acceptMove: (child: SgfNode) => this.unsolvedUnder(nodeKey(child)) > 0 || this.unsolvedUnder('') === 0,
    });
  }

  private newRound() {
    this.rounds++;
    const [side, line] = this.pick(this.leaves.filter((l) => !this.solved.has(l))).split('|');
    this.side = side as 'first' | 'second';
    this.target = line;
    this.engine = this.makeEngine();
    this.phase = 'playing';
  }
}
