import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attemptsLeft,
  emptyLearningState,
  guidedStages,
  guidedStatus,
  localDay,
  timedUnlocked,
  puzzleTimedLevel,
  recordAttemptStart,
  recordGuidedResult,
  recordTimedResult,
  setCategory,
} from '../src/progress/learning';
import { StudyEngine } from '../src/study/engine';
import { learnerDepth } from '../src/study/lines';
import { TimedRun } from '../src/study/timed';
import { BRANCHY } from './learning.test';
import { fixtureProblem, pt, solveByBook, validProblems } from './helpers';

/** Small deterministic generator; the seed is scrambled so neighboring seeds give unrelated sequences. */
const seeded = (seed: number) => {
  let x = (seed * 2654435761) % 2147483647 || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
};

const XXQJ1 = () => fixtureProblem('xxqj.sgf.gz', 0); // White, 6 learner moves, 1 line
const LEARNER = ['jj', 'ik', 'ji', 'ih', 'hi', 'hk'];

/** Replay the engine's free moves to completion. */
function finishReplay(e: StudyEngine) {
  for (let i = 0; e.phase === 'replay'; i++) {
    assert.ok(i < 2000, 'replay did not finish');
    e.replayStep();
  }
}

describe('guided run: free moves played before the player starts', () => {
  it('plays the given number of moves and their replies, then hands over', () => {
    const e = new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 3 });
    assert.equal(e.phase, 'replay');
    assert.equal(e.freeMovesPlayed, 3);
    finishReplay(e);
    assert.equal(e.phase, 'play');
    assert.equal(e.snap.toPlay, 'W', 'it is the learner’s turn');
    for (const m of LEARNER.slice(0, 3)) assert.equal(e.snap.board.get(pt(m)), 'W', `${m} was given`);
    assert.equal(e.snap.board.get(pt('jh')), 'B', 'including the opponent’s reply to the last free move');
    assert.equal(e.snap.board.get(pt(LEARNER[3])), null, 'the rest is up to the player');
    assert.equal(e.mistakes, 0, 'free moves are not mistakes');
  });

  it('the player solves the rest; a wrong move is a mistake', () => {
    const e = new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 3 });
    finishReplay(e);
    assert.equal(e.play(pt('aa')), 'wrong');
    assert.equal(e.mistakes, 1);
    assert.equal(e.play(pt('ih')), 'ok');
    assert.equal(e.play(pt('hi')), 'ok');
    assert.equal(e.play(pt('hk')), 'solved');
  });

  it('leaves exactly one move at the maximum, however large the request', () => {
    for (const ask of [5, 6, 50]) {
      const e = new StudyEngine(XXQJ1(), 'unguided', { freeMoves: ask });
      finishReplay(e);
      assert.equal(e.freeMovesPlayed, 5, `asked for ${ask}`);
      assert.equal(e.play(pt('hk')), 'solved');
    }
  });

  it('zero free moves is a plain solve, with nothing to watch', () => {
    const e = new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 0 });
    assert.equal(e.phase, 'play');
    assert.equal(e.freeMovesPlayed, 0);
    assert.equal(e.snap.board.get(pt('jj')), null);
  });

  it('a single-move puzzle has nothing to give away', () => {
    const e = new StudyEngine('(;SZ[9]PL[B]AB[ba]AW[aa];B[ab]TE[1])', 'unguided', { freeMoves: 3 });
    assert.equal(e.phase, 'play');
    assert.equal(e.freeMovesPlayed, 0);
  });

  it('is not tracked as an ordinary unguided attempt', () => {
    assert.equal(new StudyEngine(XXQJ1(), 'unguided').tracksSkill, true);
    assert.equal(new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 2 }).tracksSkill, false);
    assert.equal(new StudyEngine(XXQJ1(), 'unguided', { freeMoves: 0 }).tracksSkill, false);
  });

  it('follows a real line through a branching puzzle, whichever branch is picked', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const e = new StudyEngine(BRANCHY, 'unguided', { freeMoves: 1, rng: seeded(seed) });
      finishReplay(e);
      assert.equal(e.freeMovesPlayed, 1);
      seen.add(e.snap.board.get(pt('cc')) ? 'cc' : 'jj');
      solveByBook(e);
      assert.equal(e.mistakes, 0);
    }
    assert.deepEqual([...seen].sort(), ['cc', 'jj'], 'both first moves get picked over many runs');
  });

  it('every stage of every fixture puzzle hands over to a solvable position', () => {
    let runs = 0;
    for (const file of ['qjzm-a.sgf.gz', 'xxqj.sgf.gz', 'gzp1.sgf.gz']) {
      for (const sgf of validProblems(file)) {
        for (const free of guidedStages(learnerDepth(sgf))) {
          const e = new StudyEngine(sgf, 'unguided', { freeMoves: free, rng: seeded(runs + 1) });
          finishReplay(e);
          assert.ok(e.freeMovesPlayed <= free);
          solveByBook(e);
          assert.equal(e.mistakes, 0);
          runs++;
        }
      }
    }
    assert.ok(runs > 2000, `${runs} guided runs`);
  });
});

/** A clock the test moves by hand. */
function clock(start = 0) {
  const c = { t: start, now: () => c.t, tick: (ms: number) => (c.t += ms) };
  return c;
}

/** Play correct moves until the round ends (success), skipping refused ones. */
function playRound(run: TimedRun, c?: ReturnType<typeof clock>, stepMs = 0) {
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

function playRun(run: TimedRun, c?: ReturnType<typeof clock>, stepMs = 0) {
  run.start();
  for (let rounds = 0; run.phase !== 'done'; rounds++) {
    assert.ok(rounds < 500, 'too many rounds');
    playRound(run, c, stepMs);
    if (run.phase === 'between') run.advance();
  }
}

describe('timed run: timing and score', () => {
  it('scores correct moves per minute over the whole run', () => {
    const c = clock(1000);
    const run = new TimedRun(XXQJ1(), { now: c.now });
    assert.equal(run.phase, 'ready');
    assert.equal(run.elapsedMs(), 0, 'the clock has not started');
    run.start();
    for (const m of LEARNER) {
      c.tick(10000);
      run.play(pt(m));
    }
    assert.equal(run.phase, 'done');
    assert.equal(run.moves, 6);
    assert.equal(run.elapsedMs(), 60000);
    assert.equal(run.score(), 6);
    assert.equal(run.result().level, 'green');
  });

  it('a faster run reaches higher levels', () => {
    const levels = [
      [30000, 'gold'], // 12/min
      [20000, 'diamond'], // 18/min
      [90000, 'none'], // 4/min
    ] as const;
    for (const [ms, level] of levels) {
      const c = clock();
      const run = new TimedRun(XXQJ1(), { now: c.now });
      run.start();
      for (const m of LEARNER) {
        c.tick(ms / 6);
        run.play(pt(m));
      }
      assert.equal(run.result().level, level, `${ms}ms`);
    }
  });

  it('the clock stops when the last line is solved', () => {
    const c = clock();
    const run = new TimedRun(XXQJ1(), { now: c.now });
    run.start();
    for (const m of LEARNER) {
      c.tick(1000);
      run.play(pt(m));
    }
    const at = run.elapsedMs();
    c.tick(999999);
    assert.equal(run.elapsedMs(), at);
    assert.equal(run.score(), run.score());
  });

  it('the score is live while playing', () => {
    const c = clock();
    const run = new TimedRun(XXQJ1(), { now: c.now });
    run.start();
    c.tick(30000);
    run.play(pt('jj'));
    run.play(pt('ik'));
    assert.equal(run.score(), 4, '2 moves in half a minute');
    assert.equal(run.phase, 'playing');
  });
});

describe('timed run: mistakes end the round and halve the score', () => {
  it('a mistake fails the round, resets the puzzle, and the line comes back', () => {
    const c = clock();
    const run = new TimedRun(XXQJ1(), { now: c.now });
    run.start();
    assert.equal(run.rounds, 1);
    assert.equal(run.play(pt('aa')), 'wrong');
    assert.equal(run.mistakes, 1);
    assert.equal(run.phase, 'between');
    assert.equal(run.lastOutcome, 'fail');
    assert.equal(run.play(pt('jj')), 'illegal', 'nothing is playable while the puzzle resets');
    run.advance();
    assert.equal(run.rounds, 2);
    assert.equal(run.phase, 'playing');
    assert.equal(run.solvedLines, 0, 'the failed line still has to be solved');
    assert.equal(run.engine.snap.board.get(pt('jj')), null, 'fresh position');
    for (const m of LEARNER) {
      c.tick(10000);
      run.play(pt(m));
    }
    assert.equal(run.phase, 'done');
    assert.equal(run.moves, 6);
    assert.equal(run.score(), 3, '6 moves in 1 minute = 6, halved once');
    assert.equal(run.result().level, 'none');
  });

  it('counts correct clicks made before the mistake', () => {
    const c = clock();
    const run = new TimedRun(XXQJ1(), { now: c.now });
    run.start();
    run.play(pt('jj'));
    run.play(pt('ik'));
    assert.equal(run.play(pt('aa')), 'wrong');
    assert.equal(run.moves, 2);
    run.advance();
    c.tick(60000);
    for (const m of LEARNER) run.play(pt(m));
    assert.equal(run.moves, 8);
    assert.equal(run.mistakes, 1);
    assert.equal(run.score(), 4, '8 moves in one minute, halved');
  });

  it('every mistake halves again', () => {
    const c = clock();
    const run = new TimedRun(XXQJ1(), { now: c.now });
    run.start();
    for (let i = 0; i < 3; i++) {
      run.play(pt('aa'));
      run.advance();
    }
    c.tick(60000);
    for (const m of LEARNER) run.play(pt(m));
    assert.equal(run.mistakes, 3);
    assert.equal(run.score(), 6 / 8);
  });

  it('a tap that is not a legal move is ignored, not a mistake', () => {
    const run = new TimedRun(XXQJ1());
    run.start();
    assert.equal(run.play(pt('jk')), 'illegal', 'occupied by a stone');
    assert.equal(run.mistakes, 0);
  });
});

describe('timed run: all the lines, in random order', () => {
  it('needs every line of a branching puzzle (3), then finishes', () => {
    const run = new TimedRun(BRANCHY, { rng: seeded(3) });
    assert.equal(run.totalLines, 3);
    playRun(run);
    assert.equal(run.solvedLines, 3);
    assert.equal(run.mistakes, 0);
    assert.equal(run.rounds, 3, 'one clean round per line');
    assert.equal(run.moves, 6, 'two learner moves per line');
  });

  it('the opponent steers toward lines you have not solved yet', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const run = new TimedRun(BRANCHY, { rng: seeded(seed) });
      run.start();
      const replies: string[] = [];
      for (let round = 0; round < 2; round++) {
        assert.equal(run.play(pt('cc')), 'ok');
        replies.push(run.engine.snap.board.get(pt('dd')) ? 'dd' : 'ff');
        run.play(pt(replies[round] === 'dd' ? 'ee' : 'gg'));
        run.advance();
      }
      assert.notEqual(replies[0], replies[1], `seed ${seed}: the second round gets the other reply`);
    }
  });

  it('refuses a correct move into already-solved lines, without penalty, so the rest get found', () => {
    const run = new TimedRun(BRANCHY, { rng: seeded(5) });
    run.start();
    for (let round = 0; round < 2; round++) {
      run.play(pt('cc'));
      run.play(pt(run.engine.snap.board.get(pt('dd')) ? 'ee' : 'gg'));
      run.advance();
    }
    assert.equal(run.solvedLines, 2, 'both lines through cc are solved');
    const movesBefore = run.moves;
    const boardBefore = run.engine.snap.board;
    assert.equal(run.play(pt('cc')), 'redundant');
    assert.equal(run.mistakes, 0);
    assert.equal(run.moves, movesBefore, 'a refused move earns nothing');
    assert.equal(run.engine.snap.board, boardBefore, 'and nothing is played');
    assert.match(run.engine.snap.message, /already solved/i);
    assert.equal(run.phase, 'playing', 'the round goes on');
    assert.equal(run.play(pt('jj')), 'ok', 'the other line is accepted');
  });

  it('presents the lines in a random order', () => {
    const firstLines = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const run = new TimedRun(BRANCHY, { rng: seeded(seed) });
      run.start();
      playRound(run);
      firstLines.add(
        run.engine.snap.node ? `${run.solvedLines}:${run.engine.snap.last?.x},${run.engine.snap.last?.y}` : '',
      );
    }
    assert.ok(firstLines.size >= 2, 'the first line varies with the seed');
  });

  it('is deterministic for a given seed', () => {
    const record = (seed: number) => {
      const run = new TimedRun(BRANCHY, { rng: seeded(seed) });
      const log: string[] = [];
      run.start();
      for (let rounds = 0; run.phase !== 'done'; rounds++) {
        assert.ok(rounds < 100, 'the run never finished');
        playRound(run);
        log.push(`${run.engine.snap.last?.x},${run.engine.snap.last?.y}`);
        if (run.phase === 'between') run.advance();
      }
      return log.join('|');
    };
    assert.equal(record(9), record(9));
  });

  it('does nothing until started, and nothing after finishing', () => {
    const run = new TimedRun(XXQJ1());
    assert.equal(run.play(pt('jj')), 'illegal');
    playRun(run);
    assert.equal(run.play(pt('jj')), 'illegal');
    run.advance();
    assert.equal(run.phase, 'done');
  });

  it('a puzzle with a huge number of lines is capped, and the run can still finish', () => {
    const many = Array.from(
      { length: 250 },
      (_, i) => `(;B[${String.fromCharCode(97 + (i % 19))}${String.fromCharCode(99 + ((i / 19) | 0))}]TE[1])`,
    ).join('');
    const run = new TimedRun(`(;SZ[19]PL[B]AB[aa]${many})`);
    assert.equal(run.truncated, true);
    assert.equal(run.totalLines, 200);
    playRun(run);
    assert.equal(run.solvedLines, 200);
  });

  it('every fixture puzzle can be mastered by playing it perfectly', () => {
    let total = 0;
    for (const file of ['qjzm-a.sgf.gz', 'xxqj.sgf.gz']) {
      for (const sgf of validProblems(file)) {
        const run = new TimedRun(sgf, { rng: seeded(total + 1) });
        playRun(run);
        assert.equal(run.solvedLines, run.totalLines);
        assert.equal(run.mistakes, 0);
        total += run.totalLines;
      }
    }
    assert.ok(total >= 431);
  });
});

describe('the whole journey: add, guided stages, unlock, learning', () => {
  const sgf = XXQJ1(); // 6 learner moves: guided stages 5, 3, 1, 0
  const day = (n: number) => localDay(new Date(2026, 10, 22 + n));

  it('takes four clean guided runs over two days, then unlocks learning', () => {
    let s = setCategory(emptyLearningState(), 'learning', 'p', true);
    const L = learnerDepth(sgf);
    const log: string[] = [];

    for (let d = 0; !guidedStatus(s, 'p', L).cleared; d++) {
      assert.ok(d < 5, 'did not finish');
      assert.equal(timedUnlocked(s, 'p'), false);
      for (let a = 0; attemptsLeft(s, 'p', day(d)) > 0 && !guidedStatus(s, 'p', L).cleared; a++) {
        s = recordAttemptStart(s, 'p', day(d));
        const free = guidedStatus(s, 'p', L).free;
        const e = new StudyEngine(sgf, 'unguided', { freeMoves: free });
        finishReplay(e);
        solveByBook(e);
        s = recordGuidedResult(s, 'p', L, e.mistakes === 0);
        log.push(`day${d}:${free}`);
      }
      assert.equal(attemptsLeft(s, 'p', day(d)), guidedStatus(s, 'p', L).cleared && log.length === 3 ? 1 : 0);
    }
    assert.deepEqual(log, ['day0:5', 'day0:3', 'day1:1', 'day1:0'], 'two attempts a day');
    assert.equal(timedUnlocked(s, 'p'), true);

    // a timed run, 12 moves/min -> gold
    const c = clock();
    const run = new TimedRun(sgf, { now: c.now });
    s = recordAttemptStart(s, 'p', day(2));
    playRun(run, c, 5000);
    s = recordTimedResult(s, 'p', run.result());
    assert.equal(run.result().moves, 6);
    assert.equal(puzzleTimedLevel(s, 'p'), 'gold');
    assert.equal(attemptsLeft(s, 'p', day(2)), 1);
  });

  it('a failed guided run costs the attempt but not the progress', () => {
    let s = setCategory(emptyLearningState(), 'learning', 'p', true);
    const L = learnerDepth(sgf);
    s = recordAttemptStart(s, 'p', day(0));
    const e = new StudyEngine(sgf, 'unguided', { freeMoves: guidedStatus(s, 'p', L).free });
    finishReplay(e);
    e.play(pt('aa'));
    solveByBook(e);
    s = recordGuidedResult(s, 'p', L, e.mistakes === 0);
    assert.equal(guidedStatus(s, 'p', L).free, 5, 'still at the first stage');
    assert.equal(attemptsLeft(s, 'p', day(0)), 1);
  });
});
