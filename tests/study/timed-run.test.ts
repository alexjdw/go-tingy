import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TimedRun } from '../../src/study/timed';
import { BRANCHY, pt, seeded, validProblems, XXQJ1, LEARNER, clock, playRound, playRun } from '../lib/helpers';

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
