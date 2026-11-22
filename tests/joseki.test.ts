import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine, hasSecondSide } from '../src/study/engine';
import { MasteryRun } from '../src/study/mastery';
import { pt } from './helpers';

const seeded = (seed: number) => {
  let x = (seed * 2654435761) % 2147483647 || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
};

// A joseki: B pd, W qf, B qc, W rc.  (one line, then a branch for White's second move)
const JOSEKI = '(;GM[1]SZ[19];B[pd];W[qf];B[qc](;W[rc])(;W[pc]))';
const ONE_MOVE = '(;GM[1]SZ[19]PL[B]AB[aa][bb]AW[ab];B[ac])';

/** Play a replay out the way the screen does, one stone at a time. */
const finishReplay = (e: StudyEngine) => {
  while (e.phase === 'replay') e.replayStep();
};

describe('joseki mode: playing the second side', () => {
  it('the first side is the puzzle as usual', () => {
    const e = new StudyEngine(JOSEKI, 'unguided', { side: 'first' });
    assert.equal(e.playerColor, 'B');
    assert.equal(e.snap.toPlay, 'B');
    assert.equal(e.phase, 'play');
    assert.equal(e.play(pt('pd')), 'ok');
    assert.equal(e.snap.board.get(pt('qf')), 'W', 'White answers');
  });

  it('the second side starts after move 1, with you as the other color', () => {
    const e = new StudyEngine(JOSEKI, 'unguided', { side: 'second' });
    assert.equal(e.playerColor, 'W');
    assert.equal(e.phase, 'replay');
    assert.equal(e.snap.board.get(pt('pd')), null, 'nothing yet: the move is played during the replay');
    finishReplay(e);
    assert.equal(e.phase, 'play');
    assert.equal(e.snap.board.get(pt('pd')), 'B', 'move 1 was played for you');
    assert.equal(e.snap.toPlay, 'W');
    assert.equal(e.mistakes, 0);
  });

  it('then plays through from White, with Black answering', () => {
    const e = new StudyEngine(JOSEKI, 'unguided', { side: 'second' });
    finishReplay(e);
    assert.equal(e.play(pt('aa')), 'wrong');
    assert.equal(e.play(pt('qf')), 'ok');
    assert.equal(e.snap.board.get(pt('qc')), 'B', 'Black answers');
    assert.equal(e.play(pt('rc')), 'solved');
    assert.equal(e.mistakes, 1);
  });

  it('keeps the same flipped colors when asked to', () => {
    const e = new StudyEngine(JOSEKI, 'unguided', { side: 'second', flipped: true });
    assert.equal(e.flipped, true);
    assert.equal(e.playerColor, 'B', 'flipped: the first color is white, so the second side is black');
    finishReplay(e);
    assert.equal(e.snap.board.get(pt('pd')), 'W');
  });

  it('is not offered for a puzzle with no reply to the first move', () => {
    assert.equal(hasSecondSide(JOSEKI), true);
    assert.equal(hasSecondSide(ONE_MOVE), false);
    assert.equal(hasSecondSide('not sgf'), false);
  });

  it('does not change free exploration', () => {
    const e = new StudyEngine(JOSEKI, 'explore', { side: 'second' });
    assert.equal(e.phase, 'play');
    assert.equal(e.snap.toPlay, 'B');
  });
});

describe('joseki mode in guided and mastery runs', () => {
  it('a guided run on the second side starts with the opening and the free moves', () => {
    const e = new StudyEngine(JOSEKI, 'unguided', { side: 'second', freeMoves: 1 });
    assert.equal(e.playerColor, 'W');
    assert.equal(e.phase, 'replay');
    finishReplay(e);
    assert.equal(e.snap.board.get(pt('pd')), 'B', 'the opening was played');
    assert.equal(e.snap.board.get(pt('qf')), 'W', 'and one free move of yours');
    assert.equal(e.snap.board.get(pt('qc')), 'B', 'with Black’s answer');
    assert.equal(e.snap.toPlay, 'W');
    assert.equal(e.play(pt('rc')), 'solved');
  });

  it('with only one learner move to play there are no free moves, but the opening still is', () => {
    const e = new StudyEngine('(;GM[1]SZ[19];B[pd];W[qf])', 'unguided', { side: 'second', freeMoves: 3 });
    finishReplay(e);
    assert.equal(e.snap.board.get(pt('pd')), 'B');
    assert.equal(e.freeMovesPlayed, 0);
    assert.equal(e.play(pt('qf')), 'solved');
  });

  it('a mastery run of a joseki has every line from both sides', () => {
    const plain = new MasteryRun(JOSEKI);
    const both = new MasteryRun(JOSEKI, { joseki: true });
    assert.equal(plain.totalLines, 2);
    assert.equal(plain.bothSides, false);
    assert.equal(both.totalLines, 4);
    assert.equal(both.bothSides, true);
  });

  it('is solved only when both sides of every line are', () => {
    const run = new MasteryRun(JOSEKI, { joseki: true, rng: seeded(7) });
    run.start();
    const seen = { B: 0, W: 0 };
    for (let guard = 0; run.phase !== 'done' && guard < 60; guard++) {
      if (run.phase === 'between') {
        run.advance();
        continue;
      }
      while (run.engine.phase === 'replay') run.engine.replayStep();
      seen[run.engine.playerColor]++;
      // play the book move, trying the next one when the run refuses a line that is already solved
      for (let k = 0; k < 10 && run.phase === 'playing'; k++) {
        const kids = run.engine.snap.node!.children.map((c) => c.props.B?.[0] ?? c.props.W?.[0]);
        let r = 'redundant';
        for (const m of kids) if ((r = run.play(pt(m))) !== 'redundant') break;
        if (r !== 'ok') break;
      }
    }
    assert.equal(run.phase, 'done');
    assert.equal(run.solvedLines, 4);
    assert.ok(seen.B > 0 && seen.W > 0, 'played from both sides');
    assert.equal(run.mistakes, 0);
  });

  it('a joseki of one-move lines has only one side to play', () => {
    const run = new MasteryRun(ONE_MOVE, { joseki: true });
    assert.equal(run.bothSides, false);
    assert.equal(run.totalLines, 1);
  });
});
