import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromResponse, toRequest } from '../../src/analysis/katago';

const q = {
  cols: 9,
  rows: 9,
  initialStones: [['B', 'A1']] as ['B', string][],
  moves: [['B', 'C7']] as ['B', string][],
  player: 'W' as const,
  maxVisits: 100,
};

test('a request carries the board, stones, moves and visit limit', () => {
  const r = toRequest('7', q);
  assert.equal(r.id, '7');
  assert.equal(r.boardXSize, 9);
  assert.equal(r.maxVisits, 100);
  assert.deepEqual(r.moves, [['B', 'C7']]);
  assert.equal(r.allowMoves, undefined);
});

test('judging only some moves restricts the side to move', () => {
  const r = toRequest('1', { ...q, onlyMoves: ['D6'] });
  assert.deepEqual(r.allowMoves, [{ player: 'W', moves: ['D6'], untilDepth: 1 }]);
});

test('a response becomes moves; an error is thrown', () => {
  const a = fromResponse({
    moveInfos: [{ move: 'D6', visits: 5, winrate: 0.7, scoreLead: 2, prior: 0.3, order: 0, pv: ['D6'] }],
  });
  assert.equal(a.moves[0].winrate, 0.7);
  assert.throws(() => fromResponse({ error: 'bad query' }), /bad query/);
});

test('Black-perspective win rates are flipped when White is to move', () => {
  const raw = {
    rootInfo: { currentPlayer: 'W' },
    moveInfos: [{ move: 'D6', visits: 5, winrate: 0.7, scoreLead: 2, prior: 0.3, order: 0 }],
  };
  assert.ok(Math.abs(fromResponse(raw, true).moves[0].winrate - 0.3) < 1e-9);
  assert.equal(fromResponse(raw, false).moves[0].winrate, 0.7);
});
