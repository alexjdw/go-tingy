import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudyEngine } from '../src/study/engine';
import { computeSkill, recordAttempt, type Attempt, type ProgressMap } from '../src/progress/skill';
import { leadsOnlyToFailure, nodeMove } from '../src/sgf/parser';
import { fixtureProblem, pt, solveByBook, validProblems } from './helpers';

const FIXTURES = ['qjzm-a.sgf.gz', 'xxqj.sgf.gz', 'gzp1.sgf.gz'];

describe('solving a known problem: xxqj #1 (White to play, 6 learner moves)', () => {
  const sgf = fixtureProblem('xxqj.sgf.gz', 0);
  // book line: W jj, B ki, W ik, B hl, W ji, B jh, W ih, B kk, W hi, B ij, W hk
  const learner = ['jj', 'ik', 'ji', 'ih', 'hi', 'hk'];
  const replies = ['ki', 'hl', 'jh', 'kk', 'ij'];

  it('accepts the book line and plays the opponent replies', () => {
    const e = new StudyEngine(sgf, 'unguided');
    assert.equal(e.playerColor, 'W');
    learner.forEach((m, i) => {
      const r = e.play(pt(m));
      assert.equal(r, i === learner.length - 1 ? 'solved' : 'ok', `move ${m}`);
      if (i < replies.length) {
        assert.equal(e.snap.board.get(pt(replies[i])), 'B', `reply ${replies[i]} was played`);
        assert.equal(e.snap.toPlay, 'W', 'back to the learner');
      }
    });
    assert.equal(e.snap.status, 'solved');
    assert.equal(e.mistakes, 0);
    assert.equal(e.attempt(8000).correct, true);
  });

  it('rejects a wrong move without changing the position, then still lets you finish', () => {
    const e = new StudyEngine(sgf, 'unguided');
    const before = e.snap.board;
    assert.equal(e.play(pt('aa')), 'wrong');
    assert.equal(e.snap.board, before, 'board untouched');
    assert.equal(e.mistakes, 1);
    assert.equal(e.play(pt('jj')), 'ok');
    assert.equal(e.play(pt('ik')), 'ok');
    assert.equal(e.play(pt('aa')), 'wrong', 'also wrong deeper in the line');
    assert.equal(e.mistakes, 2);
    solveByBook(e);
    assert.equal(e.snap.status, 'solved');
    assert.equal(e.attempt(30000).correct, false, 'a mistake means an inaccurate attempt');
  });

  it('undo rewinds your move and the opponent reply', () => {
    const e = new StudyEngine(sgf, 'guided');
    e.play(pt('jj'));
    e.play(pt('ik'));
    e.undo();
    assert.equal(e.snap.board.get(pt('ik')), null);
    assert.equal(e.snap.board.get(pt('ki')), 'B', 'first exchange is intact');
    e.undo();
    assert.equal(e.snap.board.get(pt('jj')), null);
    assert.equal(e.canUndo, false);
  });

  it('guided mode shows the book move; unguided counts toward skill, fast and clean reaches gold', () => {
    const g = new StudyEngine(sgf, 'guided');
    assert.deepEqual(g.bookMoves(), [pt('jj')]);
    const e = new StudyEngine(sgf, 'unguided');
    solveByBook(e);
    const par = e.parMs();
    const attempts: Attempt[] = Array.from({ length: 5 }, (_, i) => ({
      correct: true,
      ms: par * 0.8,
      parMs: par,
      at: i,
    }));
    assert.equal(computeSkill(attempts).level, 'gold');
    assert.equal(computeSkill([{ correct: false, ms: par * 5, parMs: par, at: 0 }]).level, 'red');
  });

  it('flipped colors: same coordinates, opposite colors', () => {
    const e = new StudyEngine(sgf, 'unguided', { flipColors: 'on' });
    assert.equal(e.flipped, true);
    assert.equal(e.playerColor, 'B');
    assert.equal(e.snap.board.get(pt('jk')), 'B', 'the lone white stone became black');
    assert.equal(e.snap.board.get(pt('il')), 'W');
    learnerLine(e, ['jj', 'ik', 'ji', 'ih', 'hi', 'hk']);
    assert.equal(e.snap.status, 'solved');
    assert.equal(e.snap.board.get(pt('ki')), 'W', 'opponent replies are flipped too');
  });
});

function learnerLine(e: StudyEngine, moves: string[]) {
  for (const m of moves) assert.notEqual(e.play(pt(m)), 'wrong', m);
}

describe('solving a known problem: qjzm #1 (old FF[3] format, White to play)', () => {
  const sgf = fixtureProblem('qjzm-a.sgf.gz', 0);

  it('was normalized: setup merged, PL[2] -> W', () => {
    const e = new StudyEngine(sgf, 'unguided');
    assert.equal(e.playerColor, 'W');
    assert.equal(e.snap.board.get(pt('pb')), 'W');
    assert.equal(e.snap.board.get(pt('ob')), 'B');
  });

  it('W sa, (B sd), W sc solves it; anything else is wrong', () => {
    const wrong = new StudyEngine(sgf, 'unguided');
    assert.equal(wrong.play(pt('sb')), 'wrong');
    const e = new StudyEngine(sgf, 'unguided');
    assert.equal(e.play(pt('sa')), 'ok');
    assert.equal(e.snap.board.get(pt('sd')), 'B');
    assert.equal(e.play(pt('sc')), 'solved');
  });
});

describe('solving a problem with a marked wrong branch: qjzm #2 (Black to play)', () => {
  const sgf = fixtureProblem('qjzm-a.sgf.gz', 1);

  it('the triangle-marked move is wrong; the main line solves it', () => {
    const e = new StudyEngine(sgf, 'unguided');
    assert.equal(e.playerColor, 'B');
    assert.equal(e.play(pt('br')), 'wrong', 'br is the TR-marked refuted line');
    assert.equal(e.mistakes, 1);
    assert.equal(e.play(pt('bs')), 'ok');
    assert.equal(e.snap.board.get(pt('ar')), 'W', 'reply from the book');
    assert.equal(e.play(pt('br')), 'solved', 'br is right once the position has changed');
  });

  it('guided mode only hints the good move; explore lets you walk into the refutation', () => {
    assert.deepEqual(new StudyEngine(sgf, 'guided').bookMoves(), [pt('bs')]);
    const x = new StudyEngine(sgf, 'explore');
    assert.equal(x.bookMoves().length, 2, 'book shows both variations');
    assert.equal(x.play(pt('br')), 'ok');
    assert.equal(x.snap.node?.props.TR !== undefined, true, 'still on the book, in the marked variation');
  });
});

describe('mark-the-choices on a real problem: qjzm #3 (two good first moves, two refuted)', () => {
  const sgf = fixtureProblem('qjzm-a.sgf.gz', 2);
  const mk = () => new StudyEngine(sgf, 'unguided', { markChoices: 'on', rng: () => 0 });

  it('requires exactly the good moves (ra, rb), then lets you finish', () => {
    const e = mk();
    assert.equal(e.phase, 'mark');
    assert.equal(e.play(pt('ra')), 'illegal', 'cannot play before marking');
    e.toggleMark(pt('ra'));
    assert.equal(e.submitMarks(), 'wrong', 'rb missing');
    e.toggleMark(pt('rb'));
    e.toggleMark(pt('qa')); // the ko line is marked wrong
    assert.equal(e.submitMarks(), 'wrong', 'qa is not a good move');
    e.toggleMark(pt('qa'));
    assert.equal(e.submitMarks(), 'ok');
    assert.equal(e.mistakes, 2);
    assert.equal(e.phase, 'play');
    solveByBook(e);
    assert.equal(e.attempt(1).correct, false);
  });

  it('a clean pass has no mistakes', () => {
    const e = mk();
    e.toggleMark(pt('rb'));
    e.toggleMark(pt('ra'));
    assert.equal(e.submitMarks(), 'ok');
    assert.equal(e.play(pt('rb')), 'ok');
    solveByBook(e);
    assert.equal(e.mistakes, 0);
  });

  it('marks are only allowed on empty points', () => {
    const e = mk();
    assert.equal(e.toggleMark(pt('ob')), false, 'occupied by a stone');
    assert.equal(e.toggleMark(pt('ra')), true);
  });
});

describe('every valid problem in the fixtures', () => {
  for (const file of FIXTURES) {
    const problems = validProblems(file);

    it(`${file}: all ${problems.length} problems are solved by their book line, with colors normal and flipped`, () => {
      assert.ok(problems.length > 80);
      for (const flip of ['off', 'on'] as const) {
        for (const sgf of problems) {
          const e = new StudyEngine(sgf, 'unguided', { flipColors: flip });
          solveByBook(e);
          assert.equal(e.snap.status, 'solved');
          assert.equal(e.mistakes, 0);
        }
      }
    });

    it(`${file}: a move outside the book is always rejected and leaves the board alone`, () => {
      for (const sgf of problems) {
        const e = new StudyEngine(sgf, 'unguided');
        const inBook = new Set(e.root.children.map((c) => nodeMove(c, e.size)?.point).map((p) => p && `${p.x},${p.y}`));
        let probe: { x: number; y: number } | null = null;
        for (let y = e.size - 1; y >= 0 && !probe; y--)
          for (let x = e.size - 1; x >= 0 && !probe; x--) {
            const p = { x, y };
            if (!inBook.has(`${x},${y}`) && e.snap.board.play(p, e.playerColor)) probe = p;
          }
        assert.ok(probe, 'a legal off-book point exists');
        const before = e.snap.board;
        assert.equal(e.play(probe), 'wrong');
        assert.equal(e.snap.board, before);
        assert.equal(e.mistakes, 1);
      }
    });
  }

  it('qjzm-a: every refuted (triangle-marked) first move is rejected', () => {
    let checked = 0;
    for (const sgf of validProblems('qjzm-a.sgf.gz')) {
      const probe = new StudyEngine(sgf, 'unguided');
      for (const c of probe.root.children.filter(leadsOnlyToFailure)) {
        const e = new StudyEngine(sgf, 'unguided');
        assert.equal(e.play(nodeMove(c, e.size)!.point!), 'wrong');
        checked++;
      }
    }
    assert.ok(checked >= 45, `checked ${checked} refuted branches`);
  });

  it('mark-the-choices works on every problem that has a branching point', () => {
    let withMarkPhase = 0;
    for (const file of FIXTURES) {
      for (const sgf of validProblems(file)) {
        const e = new StudyEngine(sgf, 'unguided', { markChoices: 'on', rng: () => 0 });
        if (!e.hasMarkPhase) continue;
        withMarkPhase++;
        for (let i = 0; e.phase === 'replay'; i++) {
          assert.ok(i < 200);
          e.replayStep();
        }
        assert.equal(e.phase, 'mark');
        for (const p of e.bookMoves()) e.toggleMark(p);
        assert.equal(e.submitMarks(), 'ok');
        solveByBook(e);
        assert.equal(e.mistakes, 0);
      }
    }
    assert.ok(withMarkPhase >= 10, `only ${withMarkPhase} problems had a branching point`);
  });
});

describe('failing a puzzle', () => {
  const sgf = fixtureProblem('xxqj.sgf.gz', 0);
  const par = new StudyEngine(sgf, 'unguided').parMs();

  it('a wrong move never solves the puzzle, however many you try', () => {
    const e = new StudyEngine(sgf, 'unguided');
    for (const bad of ['aa', 'sa', 'ss', 'jk', 'kk', 'ji', 'jh']) {
      const r = e.play(pt(bad));
      assert.ok(r === 'wrong' || r === 'illegal', `${bad} -> ${r}`);
      assert.equal(e.snap.status, 'playing');
    }
    assert.ok(e.mistakes >= 5);
    assert.equal(e.snap.board.get(pt('jj')), null, 'nothing was played on the board');
  });

  it('solving after a mistake is still a failed attempt', () => {
    const e = new StudyEngine(sgf, 'unguided');
    e.play(pt('aa'));
    solveByBook(e);
    assert.equal(e.snap.status, 'solved');
    const a = e.attempt(5000);
    assert.equal(a.correct, false);
    assert.equal(a.parMs, par);
    assert.equal(a.ms, 5000);
  });

  it('a mistake late in the line fails the attempt too', () => {
    const e = new StudyEngine(sgf, 'unguided');
    e.play(pt('jj'));
    e.play(pt('ik'));
    e.play(pt('ji'));
    assert.equal(e.play(pt('aa')), 'wrong');
    solveByBook(e);
    assert.equal(e.attempt(5000).correct, false);
  });

  it('a clean, fast solve passes; the same solve with one mistake does not', () => {
    const clean = new StudyEngine(sgf, 'unguided');
    solveByBook(clean);
    assert.equal(clean.attempt(par * 0.5).correct, true);
    const sloppy = new StudyEngine(sgf, 'unguided');
    sloppy.play(pt('aa'));
    solveByBook(sloppy);
    assert.equal(sloppy.attempt(par * 0.5).correct, false);
  });

  it('restarting clears the mistakes', () => {
    const e = new StudyEngine(sgf, 'unguided');
    e.play(pt('aa'));
    e.reset();
    assert.equal(e.mistakes, 0);
    solveByBook(e);
    assert.equal(e.attempt(1000).correct, true);
  });

  it('a failed attempt is recorded and lowers the skill level', () => {
    const solve = (mistake: boolean, ms: number) => {
      const e = new StudyEngine(sgf, 'unguided');
      if (mistake) e.play(pt('aa'));
      solveByBook(e);
      return e.attempt(ms);
    };
    let progress: ProgressMap = {};
    for (let i = 0; i < 5; i++) progress = recordAttempt(progress, 'p1', solve(false, par * 0.6));
    assert.equal(computeSkill(progress.p1).level, 'gold');

    progress = recordAttempt(progress, 'p1', solve(true, par * 0.6));
    assert.equal(progress.p1.length, 6, 'the failure is in the history');
    assert.equal(progress.p1[5].correct, false);
    assert.equal(computeSkill(progress.p1).level, 'green', 'one failure drops gold to green');

    for (let i = 0; i < 3; i++) progress = recordAttempt(progress, 'p1', solve(true, par));
    assert.equal(computeSkill(progress.p1).level, 'red', 'repeated failures are red');
    assert.deepEqual(Object.keys(progress), ['p1']);
  });

  it('a slow but clean solve is not a failure, just a lower level', () => {
    const e = new StudyEngine(sgf, 'unguided');
    solveByBook(e);
    const slow = e.attempt(par * 6);
    assert.equal(slow.correct, true);
    assert.equal(computeSkill([slow, slow, slow]).level, 'yellow');
  });

  it('keeps only the most recent attempts', () => {
    let progress: ProgressMap = {};
    for (let i = 0; i < 60; i++)
      progress = recordAttempt(progress, 'p', { correct: i % 2 === 0, ms: 1, parMs: 1, at: i });
    assert.equal(progress.p.length, 50);
    assert.equal(progress.p[0].at, 10);
  });

  it('on every fixture problem: one wrong move fails the attempt, none passes it', () => {
    for (const file of FIXTURES) {
      for (const sgf of validProblems(file)) {
        const ok = new StudyEngine(sgf, 'unguided');
        solveByBook(ok);
        assert.equal(ok.attempt(1).correct, true);

        const bad = new StudyEngine(sgf, 'unguided');
        const inBook = new Set(
          bad.root.children.map((c) => nodeMove(c, bad.size)?.point).map((p) => p && `${p.x},${p.y}`),
        );
        let probe: { x: number; y: number } | null = null;
        for (let y = 0; y < bad.size && !probe; y++)
          for (let x = 0; x < bad.size && !probe; x++)
            if (!inBook.has(`${x},${y}`) && bad.snap.board.play({ x, y }, bad.playerColor)) probe = { x, y };
        assert.equal(bad.play(probe!), 'wrong');
        solveByBook(bad);
        assert.equal(bad.attempt(1).correct, false);
      }
    }
  });

  it('only unguided attempts are tracked; guided and explore mistakes are free practice', () => {
    assert.equal(new StudyEngine(sgf, 'unguided').tracksSkill, true);
    assert.equal(new StudyEngine(sgf, 'guided').tracksSkill, false);
    assert.equal(new StudyEngine(sgf, 'explore').tracksSkill, false);
    // and a stray move in those modes does not complete the puzzle
    for (const mode of ['guided', 'explore'] as const) {
      const e = new StudyEngine(sgf, mode);
      e.play(pt('aa'));
      assert.equal(e.snap.status, 'playing');
    }
  });
});
