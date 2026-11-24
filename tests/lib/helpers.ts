import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { type StudyEngine } from '../../src/study/engine';
import { type TimedRun } from '../../src/study/timed';
import { readPickedFile } from '../../src/sgf/importer';
import { splitCollection } from '../../src/sgf/parser';
import { prepareSgf } from '../../src/sgf/normalize';
import { validateSgf } from '../../src/sgf/validate';

export const fixtureBytes = (name: string) =>
  new Uint8Array(readFileSync(path.join(__dirname, '..', 'fixtures', name)));

/** Decompressed, decoded text of a fixture (what a user would see opening it, or paste from it). */
export const fixtureText = (name: string) =>
  readPickedFile(name, fixtureBytes(name))
    .map((b) => b.text)
    .join('\n');

/** The i-th puzzle in a fixture, normalized the way the importer stores it. */
export const fixtureProblem = (name: string, index: number) =>
  prepareSgf(splitCollection(fixtureText(name))[index]).sgf;

/** Every puzzle in a fixture that passes validation, as stored sgf. */
export const validProblems = (name: string) =>
  splitCollection(fixtureText(name))
    .map((t) => prepareSgf(t).sgf)
    .filter((sgf) => !validateSgf(sgf).errors.length);

/** "ab" style SGF coordinate -> point. */
export const pt = (s: string) => ({ x: s.charCodeAt(0) - 97, y: s.charCodeAt(1) - 97 });

/**
 * Solve by following the book: at every learner turn play the first move that doesn't lead only to failure.
 * Returns the sequence of learner moves played. Throws if any move is rejected.
 */
export function solveByBook(e: StudyEngine, limit = 400): { x: number; y: number }[] {
  const played: { x: number; y: number }[] = [];
  while (e.snap.status !== 'solved') {
    if (played.length > limit) throw new Error('did not terminate');
    const [p] = e.bookMoves();
    if (!p) throw new Error('no book move available');
    const r = e.play(p);
    if (r === 'wrong' || r === 'illegal') throw new Error(`book move rejected (${r}) at ${p.x},${p.y}`);
    played.push(p);
  }
  return played;
}

/** Small deterministic random generator; the seed is scrambled so neighboring seeds give unrelated sequences. */
export const seeded = (seed: number) => {
  let x = (seed * 2654435761) % 2147483647 || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
};

/** A puzzle with several lines of different lengths: the standard branching test puzzle. */
export const BRANCHY =
  '(;SZ[19]PL[B]AB[aa]AW[ab](;B[cc](;W[dd];B[ee]TE[1])(;W[ff];B[gg]TE[1]))(;B[jj];W[kk];B[ll]TE[1])(;B[mm]BM[1]))';

export const XXQJ1 = () => fixtureProblem('xxqj.sgf.gz', 0); // White, 6 learner moves, 1 line
export const LEARNER = ['jj', 'ik', 'ji', 'ih', 'hi', 'hk'];

/** Replay the engine's free moves to completion. */
export function finishReplay(e: StudyEngine) {
  for (let i = 0; e.phase === 'replay'; i++) {
    assert.ok(i < 2000, 'replay did not finish');
    e.replayStep();
  }
}

/** A clock the test moves by hand. */
export function clock(start = 0) {
  const c = { t: start, now: () => c.t, tick: (ms: number) => (c.t += ms) };
  return c;
}

/** Play correct moves until the round ends (success), skipping refused ones. */
export function playRound(run: TimedRun, c?: ReturnType<typeof clock>, stepMs = 0) {
  for (let guard = 0; run.phase === 'playing'; guard++) {
    assert.ok(guard < 1000, 'stuck'); // some collection lines run past 150 moves
    let moved = false;
    for (const p of run.engine.bookMoves()) {
      const r = run.play(p);
      if (r === 'redundant') continue;
      assert.notEqual(r, 'wrong');
      moved = true;
      break;
    }
    assert.ok(moved, 'no acceptable move');
    c?.tick(stepMs);
  }
}

export function playRun(run: TimedRun, c?: ReturnType<typeof clock>, stepMs = 0) {
  run.start();
  for (let rounds = 0; run.phase !== 'done'; rounds++) {
    assert.ok(rounds < 500, 'too many rounds');
    playRound(run, c, stepMs);
    if (run.phase === 'between') run.advance();
  }
}
