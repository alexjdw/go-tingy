import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardDims, parseSgf } from '../../src/sgf/parser';
import { solutionDiagram } from '../../src/study/diagram';

const show = (sgf: string) => {
  const root = parseSgf(sgf);
  return solutionDiagram(root, boardDims(root));
};

describe('solutionDiagram', () => {
  it('numbers the main line from 1 and leaves setup stones unnumbered', () => {
    const d = show('(;SZ[9]AB[aa]AW[bb];B[cc];W[dd];B[ee])');
    assert.deepEqual(
      d.numbers.map((m) => [m.point.x, m.point.y, m.n]),
      [
        [2, 2, 1],
        [3, 3, 2],
        [4, 4, 3],
      ],
    );
    assert.equal(d.board.get({ x: 0, y: 0 }), 'B');
    assert.equal(
      d.numbers.some((m) => m.point.x === 0 && m.point.y === 0),
      false,
    );
  });

  it('follows the correct branch, not a wrong one listed first', () => {
    const d = show('(;SZ[9](;B[aa]BM[1];W[bb])(;B[cc];W[dd]))');
    assert.deepEqual(
      d.numbers.map((m) => m.n),
      [1, 2],
    );
    assert.equal(d.board.get({ x: 2, y: 2 }), 'B');
    assert.equal(d.board.get({ x: 0, y: 0 }), null);
  });
});
