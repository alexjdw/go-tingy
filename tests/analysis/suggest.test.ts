import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bridgeAnalyzer, getBridge } from '../../src/analysis/bridge';
import type { Analyzer, Query } from '../../src/analysis/engine';
import { embedSetup } from '../../src/analysis/position';
import { suggestMoves } from '../../src/analysis/suggest';
import { NO_OPEN_EDGES } from '../../src/sgf/parser';

const setup = {
  dims: { cols: 9, rows: 9 },
  open: NO_OPEN_EDGES,
  black: [{ x: 1, y: 0 }],
  white: [{ x: 0, y: 1 }],
  player: 'B' as const,
};

const mv = (move: string, order: number, winrate: number, pv: string[]) => ({
  move,
  visits: 10,
  winrate,
  scoreLead: 1,
  prior: 0.2,
  order,
  pv,
});

test('a setup is embedded like the same puzzle read from SGF', () => {
  const e = embedSetup(setup);
  assert.deepEqual(e.initialStones, [
    ['B', 'B9'],
    ['W', 'A8'],
  ]);
  assert.equal(e.cols, 9);
});

test('suggestions come back in the engine order, as puzzle points, limited to the puzzle region', async () => {
  let seen: Query | undefined;
  const analyzer: Analyzer = {
    async analyze(q) {
      seen = q;
      return { moves: [mv('C8', 1, 0.4, ['C8']), mv('A9', 0, 0.8, ['A9', 'C8', 'J1']), mv('B8', 2, 0.1, ['B8'])] };
    },
  };
  const s = await suggestMoves(analyzer, setup, [{ color: 'B', point: { x: 2, y: 1 } }], 'W', [{ x: 2, y: 1 }], {
    count: 2,
  });
  assert.deepEqual(
    s.map((m) => m.point),
    [
      { x: 0, y: 0 },
      { x: 2, y: 1 },
    ],
  );
  // the engine's line may go anywhere on the board, even outside the area it was asked about
  assert.deepEqual(s[0].line, [
    { x: 0, y: 0 },
    { x: 2, y: 1 },
    { x: 8, y: 8 },
  ]);
  assert.deepEqual(seen?.moves, [['B', 'C8']]);
  assert.equal(seen?.player, 'W');
  assert.ok(seen?.onlyMoves?.includes('A9'));
  assert.ok(!seen?.onlyMoves?.includes('J1'));
});

test('the bridge is only found where the shell put it', () => {
  assert.equal(getBridge({}), null);
  assert.equal(getBridge({ katago: {} }), null);
  const b = { status: async () => ({ ready: true, message: '' }), query: async () => '{}' };
  assert.equal(getBridge({ katago: b }), b);
});

test('the bridge analyzer sends a JSON request and reads the JSON answer', async () => {
  let sent = '';
  const bridge = {
    status: async () => ({ ready: true, message: '' }),
    query: async (text: string) => {
      sent = text;
      return JSON.stringify({
        moveInfos: [{ move: 'D4', visits: 3, winrate: 0.5, scoreLead: 0, prior: 0.1, order: 0, pv: ['D4'] }],
      });
    },
  };
  const a = await bridgeAnalyzer(bridge).analyze({
    cols: 9,
    rows: 9,
    initialStones: [],
    moves: [],
    player: 'B',
    maxVisits: 5,
  });
  assert.equal(JSON.parse(sent).maxVisits, 5);
  assert.equal(a.moves[0].move, 'D4');
});
