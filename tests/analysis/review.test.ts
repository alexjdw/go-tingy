import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Analysis, Analyzer, MoveInfo, Query } from '../../src/analysis/engine';
import { embed, gtpName, movesTo, pointOf } from '../../src/analysis/position';
import { reviewPuzzle, suggestedMarks } from '../../src/analysis/review';
import { boardDims, parseSgf } from '../../src/sgf/parser';

const info = (move: string, winrate: number, order: number): MoveInfo => ({
  move,
  visits: 100,
  winrate,
  scoreLead: 0,
  prior: 0.1,
  order,
  pv: [move],
});

/** An engine with a fixed table per number of moves played: a win chance, or [win chance, score lead], per move. */
function fake(byDepth: Record<number, Record<string, number | [number, number]>>): Analyzer & { queries: Query[] } {
  const queries: Query[] = [];
  const win = (v: number | [number, number]) => (typeof v === 'number' ? v : v[0]);
  return {
    queries,
    async analyze(q: Query): Promise<Analysis> {
      queries.push(q);
      const table = byDepth[q.moves.length] ?? {};
      const names = Object.keys(table).filter((m) => !q.onlyMoves || q.onlyMoves.includes(m));
      names.sort((a, b) => win(table[b]) - win(table[a]));
      return {
        moves: names.map((m, i) => {
          const v = table[m];
          return { ...info(m, win(v), i), scoreLead: typeof v === 'number' ? 0 : v[1] };
        }),
      };
    },
  };
}

test('GTP names skip the letter I and count rows from the bottom', () => {
  assert.equal(gtpName(0, 0, 9), 'A9');
  assert.equal(gtpName(8, 8, 9), 'J1');
  assert.equal(gtpName(3, 15, 19), 'D4');
});

test('a closed puzzle keeps its own size; an open edge extends the board there', () => {
  const closed = embed(parseSgf('(;SZ[9]AB[aa])'));
  assert.deepEqual([closed.cols, closed.rows, closed.dx, closed.dy], [9, 9, 0, 0]);
  const open = parseSgf('(;SZ[9]OE[br]AB[aa])');
  const e = embed(open);
  assert.deepEqual([e.cols, e.rows, e.dx, e.dy], [19, 19, 0, 0]);
  const left = embed(parseSgf('(;SZ[9]OE[l]AB[aa])'));
  assert.deepEqual([left.cols, left.dx], [19, 10]);
  assert.deepEqual(left.initialStones, [['B', 'L9']]);
});

test('points map to the engine and back', () => {
  const root = parseSgf('(;SZ[9]OE[l];B[bc])');
  const dims = boardDims(root);
  const e = embed(root);
  assert.deepEqual(movesTo(root.children[0], e, dims), [['B', 'M7']]);
  assert.deepEqual(pointOf(e, 'M7', dims), { x: 1, y: 2 });
  assert.equal(pointOf(e, 'A1', dims), null);
  assert.equal(pointOf(e, 'pass', dims), null);
});

const SGF = '(;SZ[9]PL[B]AB[ba][ab]AW[bb][aa];B[cc](;W[dd];B[ee])(;W[ff]))';

test('agreement: the tree matches the engine, so there are no disagreements', async () => {
  const a = fake({ 0: { C7: 0.9, D6: 0.4 }, 1: { F4: 0.2, E5: 0.2 }, 2: { E5: 0.8 } });
  const r = await reviewPuzzle(SGF, a);
  assert.equal(r.nodes[0].moves[0].verdict, 'best');
  assert.equal(
    r.findings.some((f) => f.kind === 'marked-correct-engine-disagrees'),
    false,
  );
});

test('a move marked correct that the engine thinks is bad is flagged', async () => {
  const a = fake({ 0: { C7: 0.2, D6: 0.9 } });
  const r = await reviewPuzzle('(;SZ[9]PL[B];B[cc]TE[1])', a);
  assert.deepEqual(
    r.findings.map((f) => f.kind),
    ['marked-correct-engine-disagrees', 'missing-move'],
  );
  assert.deepEqual(r.nodes[0].missing[0].point, { x: 3, y: 3 });
});

test('a move the engine skipped is judged on its own, not counted as bad', async () => {
  const a = fake({ 0: { C7: 0.5 } });
  // D6 is only in the table for depth 0 when asked for directly; here the fake has no entry, so it stays unjudged.
  const r = await reviewPuzzle('(;SZ[9]PL[B];B[dd])', a);
  assert.equal(r.nodes[0].moves[0].verdict, null);
  assert.deepEqual(a.queries.find((q) => q.onlyMoves?.length === 1)?.onlyMoves, ['D6']);
});

test('a reply the opponent has that beats every reply in the tree is a missing reply', async () => {
  const a = fake({ 0: { C7: 0.9 }, 1: { D6: 0.3, F4: 0.7 } });
  const r = await reviewPuzzle('(;SZ[9]PL[B];B[cc];W[dd])', a);
  assert.deepEqual(
    r.findings.filter((f) => f.kind === 'missing-reply').map((f) => f.point),
    [{ x: 5, y: 5 }],
  );
});

test('in a settled position other moves that are just as good are not reported', async () => {
  const a = fake({ 0: { C7: 0.9 }, 1: { D6: 0.3, F4: 0.3, G3: 0.3 } });
  const r = await reviewPuzzle('(;SZ[9]PL[B];B[cc];W[dd])', a);
  assert.deepEqual(r.findings, []);
  assert.equal(r.nodes[1].missing.length, 2);
  assert.equal(r.verdict, 'agrees');
});

test('the query limit stops the review and says so', async () => {
  const a = fake({ 0: { C7: 0.9 }, 1: { D6: 0.3 }, 2: { E5: 0.8 } });
  const r = await reviewPuzzle(SGF, a, { maxQueries: 1 });
  assert.equal(r.truncated, true);
  assert.equal(a.queries.length, 1);
});

test('wrong-marked lines are not walked', async () => {
  const a = fake({ 0: { C7: 0.2, D6: 0.9 } });
  await reviewPuzzle('(;SZ[9]PL[B];B[cc]BM[1];W[dd])', a);
  assert.equal(a.queries.length, 1);
});

test('the engine is only asked about points near the puzzle, so it cannot suggest a move far away', async () => {
  const a = fake({ 0: { C7: 0.9, J1: 0.95 } });
  const r = await reviewPuzzle('(;SZ[9]PL[B];B[cc])', a);
  const asked = a.queries[0].onlyMoves ?? [];
  assert.ok(asked.includes('C7') && asked.includes('E5'));
  assert.ok(!asked.includes('J1'));
  assert.equal(r.nodes[0].best?.point?.x, 2);
});

test('equal win chances are told apart by points: a move that throws away territory is worse', async () => {
  const a = fake({ 0: { C7: [0.99, 20], D6: [0.99, 2] } });
  const r = await reviewPuzzle('(;SZ[9]PL[B];B[dd])', a);
  assert.equal(r.nodes[0].best?.point?.x, 2);
  assert.equal(r.nodes[0].moves[0].verdict, 'bad');
  assert.equal(r.verdict, 'diverges');
  assert.equal(r.firstDivergence, 'B:dd');
});

test('the verdict: agrees, incomplete, diverges or unjudged', async () => {
  const good = await reviewPuzzle('(;SZ[9]PL[B];B[cc])', fake({ 0: { C7: 0.9, D6: 0.2 } }));
  assert.equal(good.verdict, 'agrees');
  const gap = await reviewPuzzle('(;SZ[9]PL[B];B[cc];W[dd])', fake({ 0: { C7: 0.9 }, 1: { D6: 0.3, F4: 0.7 } }));
  assert.equal(gap.verdict, 'incomplete');
  const none = await reviewPuzzle('(;SZ[9]PL[B];B[cc])', fake({}));
  assert.equal(none.verdict, 'unjudged');
});

test('a position where the tree ends is not reported as missing replies', async () => {
  const r = await reviewPuzzle('(;SZ[9]PL[B];B[cc])', fake({ 0: { C7: 0.9 }, 1: { D6: 0.3 } }));
  assert.deepEqual(r.findings, []);
});

test('suggested marks: moves the engine likes are correct, moves it dislikes are wrong', async () => {
  const a = fake({ 0: { C7: 0.9, D6: 0.1 } });
  const r = await reviewPuzzle('(;SZ[9]PL[B](;B[cc])(;B[dd]))', a);
  assert.deepEqual(suggestedMarks(r), { correct: ['B:cc'], wrong: ['B:dd'] });
});
