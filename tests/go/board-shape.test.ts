import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Board } from '../../src/go/board';
import { computeViewport, fullViewport, gridGeometry, initialViewport } from '../../src/go/viewport';
import { BOARD_PRESETS, resizeSetup, writeBoardProps } from '../../src/sgf/editing';
import { addToBatch } from '../../src/sgf/importer';
import {
  NO_OPEN_EDGES,
  boardDims,
  formatOpenEdges,
  formatSize,
  hasOpenEdge,
  openEdges,
  parseSgf,
  parseSize,
  sgfToPoint,
  toSgf,
  type SgfNode,
} from '../../src/sgf/parser';
import { validateSgf } from '../../src/sgf/validate';
import { StudyEngine } from '../../src/study/engine';
import { pt } from '../lib/helpers';

describe('board size: SZ[n] and SZ[cols:rows]', () => {
  it('parses squares, rectangles and whitespace', () => {
    assert.deepEqual(parseSize('19'), { cols: 19, rows: 19 });
    assert.deepEqual(parseSize('9:5'), { cols: 9, rows: 5 });
    assert.deepEqual(parseSize(' 13 : 7 '), { cols: 13, rows: 7 });
    assert.deepEqual(parseSize('2:25'), { cols: 2, rows: 25 });
  });

  it('rejects malformed or out-of-range sizes', () => {
    for (const bad of ['1', '26', '9:', ':5', '9:1', '9:26', '0:5', 'abc', '9x5', '9:5:3', '-9', '', undefined]) {
      assert.equal(parseSize(bad), null, String(bad));
    }
  });

  it('defaults to 19x19 when absent, and formats back to the shortest form', () => {
    assert.deepEqual(boardDims(parseSgf('(;B[aa])')), { cols: 19, rows: 19 });
    assert.deepEqual(boardDims(parseSgf('(;SZ[9:5];B[aa])')), { cols: 9, rows: 5 });
    assert.equal(formatSize({ cols: 19, rows: 19 }), '19');
    assert.equal(formatSize({ cols: 9, rows: 5 }), '9:5');
    assert.equal(formatSize({ cols: 5, rows: 9 }), '5:9');
  });

  it('point coordinates are bounded per axis', () => {
    const d = { cols: 9, rows: 5 };
    assert.deepEqual(sgfToPoint('ie', d), { x: 8, y: 4 }, 'far corner is valid');
    assert.equal(sgfToPoint('ja', d), null, 'column 10 is off a 9-wide board');
    assert.equal(sgfToPoint('af', d), null, 'row 6 is off a 5-tall board');
  });
});

describe('open edges: OE[...]', () => {
  it('parses any combination, case-insensitively', () => {
    assert.deepEqual(openEdges(parseSgf('(;SZ[9];B[aa])')), NO_OPEN_EDGES);
    assert.deepEqual(openEdges(parseSgf('(;OE[tl];B[aa])')), { top: true, left: true, right: false, bottom: false });
    assert.deepEqual(openEdges(parseSgf('(;OE[TRBL];B[aa])')), { top: true, right: true, bottom: true, left: true });
  });

  it('formats in a fixed order, and nothing when every border is present', () => {
    assert.equal(formatOpenEdges({ top: false, right: false, bottom: false, left: true }), 'l');
    assert.equal(formatOpenEdges({ top: true, right: false, bottom: true, left: true }), 'tbl');
    assert.equal(formatOpenEdges({ top: true, right: true, bottom: true, left: true }), 'trbl');
    assert.equal(formatOpenEdges(NO_OPEN_EDGES), null);
    assert.equal(hasOpenEdge(NO_OPEN_EDGES), false);
    assert.equal(hasOpenEdge({ ...NO_OPEN_EDGES, bottom: true }), true);
  });

  it('survives a parse/serialize round trip next to a rectangular SZ', () => {
    const sgf = '(;SZ[9:5]OE[tl];B[aa])';
    assert.equal(toSgf(parseSgf(sgf)), sgf);
  });
});

describe('rules on a rectangular board', () => {
  it('rejects points off the board instead of wrapping into the next row', () => {
    const b = new Board(5, 3);
    assert.equal(b.play({ x: 5, y: 0 }, 'B'), null, 'x == cols would alias (0, 1)');
    assert.equal(b.play({ x: 0, y: 3 }, 'B'), null);
    assert.equal(b.play({ x: -1, y: 0 }, 'B'), null);
    assert.ok(b.play({ x: 4, y: 2 }, 'B'), 'the far corner is on the board');
  });

  it('neighbors do not wrap across the right edge', () => {
    // W in the top-right corner (4,0) touches only (3,0) and (4,1). (0,1) is the next array index and is empty:
    // a board that wrapped would count it as a liberty and fail to capture.
    const b = new Board(5, 3).withStone({ x: 4, y: 0 }, 'W').withStone({ x: 3, y: 0 }, 'B');
    const r = b.play({ x: 4, y: 1 }, 'B');
    assert.ok(r);
    assert.equal(r.captured, 1, 'captured with just two attackers: no phantom liberty at (0,1)');
    assert.equal(r.board.get({ x: 4, y: 0 }), null);
  });

  it('neighbors do not wrap across the left edge either', () => {
    // W at (0,1) touches (0,0), (1,1), (0,2) only; (4,0) is the previous array index and is empty.
    let b = new Board(5, 3)
      .withStone({ x: 0, y: 1 }, 'W')
      .withStone({ x: 0, y: 0 }, 'B')
      .withStone({ x: 1, y: 1 }, 'B');
    b = b.withStone({ x: 0, y: 2 }, 'B');
    const r = new Board(5, 3)
      .withStone({ x: 0, y: 1 }, 'W')
      .withStone({ x: 0, y: 0 }, 'B')
      .withStone({ x: 1, y: 1 }, 'B')
      .play({ x: 0, y: 2 }, 'B');
    assert.equal(r?.captured, 1);
    assert.equal(b.get({ x: 0, y: 1 }), 'W', 'setup placement alone does not capture');
  });

  it('captures against the bottom edge of a short board', () => {
    // 9 wide, 2 tall: W at (3,1) is on the bottom row, so it has no liberty below.
    const b = new Board(9, 2)
      .withStone({ x: 3, y: 1 }, 'W')
      .withStone({ x: 2, y: 1 }, 'B')
      .withStone({ x: 3, y: 0 }, 'B');
    assert.deepEqual([b.cols, b.rows], [9, 2]);
    assert.equal(b.play({ x: 4, y: 1 }, 'B')?.captured, 1);
  });

  it('is still square-compatible: new Board(n) is n by n', () => {
    const b = new Board(5);
    assert.deepEqual([b.cols, b.rows], [5, 5]);
  });
});

describe('validating rectangular SGF', () => {
  it('accepts a full-range rectangular puzzle and reports its shape', () => {
    const v = validateSgf('(;SZ[9:5]AB[ie]AW[ia];B[ib]TE[1])');
    assert.deepEqual(v.errors, []);
    assert.deepEqual(v.dims, { cols: 9, rows: 5 });
  });

  it('names the rectangle when something is off it', () => {
    assert.match(validateSgf('(;SZ[9:5];B[af])').errors[0], /outside the 9×5 board/);
    assert.match(validateSgf('(;SZ[9:5];B[ja])').errors[0], /outside the 9×5 board/);
    assert.match(validateSgf('(;SZ[9:5]AB[ja];B[aa])').errors[0], /AB point "ja" is outside the 9×5 board/);
  });

  it('rejects unusable sizes', () => {
    for (const sz of ['9:1', '30', '9:30', '9x5', 'abc']) {
      assert.match(validateSgf(`(;SZ[${sz}];B[aa])`).errors[0], /Unsupported board size/, sz);
    }
  });

  it('warns about an OE with letters other than t, r, b, l', () => {
    assert.ok(validateSgf('(;SZ[9]OE[tx];B[aa])').warnings.some((w) => /OE/.test(w)));
    assert.deepEqual(
      validateSgf('(;SZ[9]OE[tr];B[aa])').warnings.filter((w) => /OE/.test(w)),
      [],
    );
  });

  it('numbers rows from the bottom of the rectangle in error messages', () => {
    // top-left of a 9x5 board is A5, not A9
    assert.match(validateSgf('(;SZ[9:5]AB[ba][ab];W[aa])').errors[0], /Illegal white move at A5/);
  });
});

describe('solving on a rectangular board', () => {
  // White stone in the corner of a 5-wide, 3-tall board; Black captures it.
  const sgf = '(;SZ[5:3]OE[tr]PL[B]AB[ba]AW[aa];B[ab]TE[1])';

  it('builds the board with the right shape and open edges', () => {
    const e = new StudyEngine(sgf, 'unguided');
    assert.deepEqual(e.dims, { cols: 5, rows: 3 });
    assert.deepEqual(e.open, { top: true, right: true, bottom: false, left: false });
    assert.equal(e.snap.board.cols, 5);
    assert.equal(e.snap.board.rows, 3);
  });

  it('solves it, capturing the stone against the real edge', () => {
    const e = new StudyEngine(sgf, 'unguided');
    assert.equal(e.play(pt('ab')), 'solved');
    assert.equal(e.snap.board.get(pt('aa')), null);
  });

  it('treats open edges as display only: rules still end at the diagram edge', () => {
    // The top edge is open, but a stone on the top row still has no liberties above it.
    const open = new StudyEngine('(;SZ[3:3]OE[t]PL[B]AB[ba]AW[aa];B[ab]TE[1])', 'unguided');
    assert.equal(open.play(pt('ab')), 'solved', 'captured even though the top is "open"');
  });

  it('refuses points beyond the rectangle', () => {
    const e = new StudyEngine(sgf, 'unguided');
    assert.equal(e.play({ x: 5, y: 0 }), 'illegal');
    assert.equal(e.play({ x: 0, y: 3 }), 'illegal');
    assert.equal(e.mistakes, 0, 'off-board taps are ignored, not mistakes');
  });

  it('flipping colors keeps the shape', () => {
    const e = new StudyEngine(sgf, 'unguided', { flipColors: 'on' });
    assert.deepEqual(e.dims, { cols: 5, rows: 3 });
    assert.equal(e.playerColor, 'W');
    assert.equal(e.play(pt('ab')), 'solved');
  });

  it('wide strips work too (19x5)', () => {
    const e = new StudyEngine('(;SZ[19:5]PL[B]AB[sd]AW[sc]LB[sa:A][sb:B];B[sb]TE[1])', 'unguided');
    assert.deepEqual(e.dims, { cols: 19, rows: 5 });
    assert.equal(e.choicePoints().length, 2);
  });
});

describe('what is shown when a problem opens', () => {
  const stones = [pt('cc'), pt('dd')];

  it('crops a plain 19x19 around the stones (unchanged behavior)', () => {
    const v = initialViewport(stones, { cols: 19, rows: 19 }, NO_OPEN_EDGES);
    assert.deepEqual(v, computeViewport(stones, { cols: 19, rows: 19 }));
    assert.ok(v.x1 < 18 && v.y1 < 18, 'far side is cropped away');
  });

  it('shows a rectangular board in full', () => {
    assert.deepEqual(initialViewport(stones, { cols: 9, rows: 5 }, NO_OPEN_EDGES), fullViewport({ cols: 9, rows: 5 }));
    assert.deepEqual(fullViewport({ cols: 9, rows: 5 }), { x0: 0, x1: 8, y0: 0, y1: 4 });
  });

  it('shows a board with an open edge in full, even if square', () => {
    const open = { ...NO_OPEN_EDGES, left: true };
    assert.deepEqual(initialViewport(stones, { cols: 19, rows: 19 }, open), fullViewport({ cols: 19, rows: 19 }));
  });

  it('crops without overrunning a short or narrow board', () => {
    const v = computeViewport([pt('aa')], { cols: 4, rows: 3 });
    assert.deepEqual(v, { x0: 0, x1: 3, y0: 0, y1: 2 });
  });
});

describe('importing rectangular puzzles', () => {
  it('imports and pastes them with their shape intact', () => {
    const text = '(;GM[1]SZ[9:5]OE[tl]PL[B]AB[ba]AW[aa];B[ab]TE[1])';
    const [e] = addToBatch([], new Set(), [{ name: 'Pasted puzzle', text }]);
    assert.equal(e.include, true);
    assert.deepEqual(e.v.dims, { cols: 9, rows: 5 });
    assert.ok(e.sgf.includes('SZ[9:5]') && e.sgf.includes('OE[tl]'), 'nothing lost in normalization');
  });

  it('rejects one with a point outside its rectangle but keeps the others', () => {
    const text = '(;SZ[9:5];B[aa]TE[1])(;SZ[9:5];B[aj])(;SZ[9:5];W[ie]TE[1])';
    const entries = addToBatch([], new Set(), [{ name: 'x', text }]);
    assert.deepEqual(
      entries.map((e) => e.include),
      [true, false, true],
    );
    assert.match(entries[1].v.errors[0], /outside the 9×5 board/);
  });
});

describe('editor: resizing and saving the board shape', () => {
  const node = (props: Record<string, string[]>, children: SgfNode[] = []): SgfNode => {
    const n: SgfNode = { props, children, parent: null };
    children.forEach((c) => (c.parent = n));
    return n;
  };
  const d19 = { cols: 19, rows: 19 };

  it('keeps stones that still fit and counts the ones that do not', () => {
    const root = node({});
    const r = resizeSetup([pt('aa'), pt('jj')], [pt('ba'), pt('ss')], root, d19, { cols: 9, rows: 9 });
    assert.deepEqual(r.black, [pt('aa')]);
    assert.deepEqual(r.white, [pt('ba')]);
    assert.equal(r.dropped, 2);
    assert.equal(r.treeFits, true, 'an empty tree always fits');
  });

  it('checks each axis separately when the board becomes a rectangle', () => {
    const root = node({});
    const r = resizeSetup([pt('ia'), pt('ai')], [], root, d19, { cols: 9, rows: 5 });
    assert.deepEqual(r.black, [pt('ia')], 'column 9 fits a 9-wide board; row 9 does not fit 5 rows');
    assert.equal(r.dropped, 1);
  });

  it('reports whether the whole tree, including variations, still fits', () => {
    const fitting = node({}, [node({ B: ['aa'] }, [node({ W: ['ba'] })])]);
    assert.equal(resizeSetup([], [], fitting, d19, { cols: 9, rows: 5 }).treeFits, true);
    const deep = node({}, [node({ B: ['aa'] }, [node({ W: ['ba'] }), node({ W: ['ae'] }), node({ W: ['af'] })])]);
    assert.equal(resizeSetup([], [], deep, d19, { cols: 9, rows: 5 }).treeFits, false, 'a variation reaches row 6');
    const pass = node({}, [node({ B: [''] })]);
    assert.equal(resizeSetup([], [], pass, d19, { cols: 2, rows: 2 }).treeFits, true, 'passes always fit');
  });

  it('growing the board never drops anything', () => {
    const root = node({}, [node({ B: ['ii'] })]);
    const r = resizeSetup([pt('ii')], [pt('hh')], root, { cols: 9, rows: 9 }, d19);
    assert.deepEqual([r.dropped, r.treeFits, r.black.length, r.white.length], [0, true, 1, 1]);
  });

  it('writes SZ always and OE only when a border is open', () => {
    const root = node({ SZ: ['19'], OE: ['tl'] });
    writeBoardProps(root, { cols: 9, rows: 5 }, { top: false, right: false, bottom: true, left: false });
    assert.deepEqual(root.props.SZ, ['9:5']);
    assert.deepEqual(root.props.OE, ['b']);
    writeBoardProps(root, { cols: 13, rows: 13 }, NO_OPEN_EDGES);
    assert.deepEqual(root.props.SZ, ['13'], 'squares keep the plain form');
    assert.equal(root.props.OE, undefined, 'no stale OE once every border is back');
  });

  it('what the editor writes is what the validator, engine and importer read back', () => {
    const dims = { cols: 9, rows: 5 };
    const open = { top: true, right: false, bottom: false, left: true };
    const root = node({ GM: ['1'], PL: ['B'], AB: ['ba'], AW: ['aa'] }, [node({ B: ['ab'], TE: ['1'] })]);
    writeBoardProps(root, dims, open);
    const sgf = toSgf(root);
    assert.match(sgf, /SZ\[9:5\]/);
    assert.match(sgf, /OE\[tl\]/);
    assert.deepEqual(validateSgf(sgf).errors, []);
    const e = new StudyEngine(sgf, 'unguided');
    assert.deepEqual([e.dims, e.open], [dims, open]);
    assert.equal(e.play(pt('ab')), 'solved');
    const [entry] = addToBatch([], new Set(), [{ name: 'Pasted puzzle', text: sgf }]);
    assert.equal(entry.include, true);
    assert.deepEqual(entry.v.dims, dims);
  });
});

describe('drawing: real borders vs open edges', () => {
  const dims = { cols: 9, rows: 5 };
  const view = fullViewport(dims);
  const W = 400;

  it('a fully bordered board has heavy outer lines that stop at the last points', () => {
    const g = gridGeometry(view, dims, NO_OPEN_EDGES, W);
    assert.deepEqual(g.real, { left: true, right: true, top: true, bottom: true });
    assert.equal(g.vertical.length, 9);
    assert.equal(g.horizontal.length, 5);
    assert.deepEqual(
      g.vertical.map((l) => l.heavy),
      [true, false, false, false, false, false, false, false, true],
    );
    assert.deepEqual(
      g.horizontal.map((l) => l.heavy),
      [true, false, false, false, true],
    );
    // every line ends exactly at the first/last intersection, leaving wood margin around the grid
    for (const l of g.vertical) assert.deepEqual([l.y1, l.y2], [g.py(0), g.py(4)]);
    for (const l of g.horizontal) assert.deepEqual([l.x1, l.x2], [g.px(0), g.px(8)]);
    assert.ok(g.px(0) > 0 && g.px(8) < W, 'there is margin');
  });

  it('an open side has no heavy line there and its lines run to the edge of the picture', () => {
    const g = gridGeometry(view, dims, { ...NO_OPEN_EDGES, left: true }, W);
    assert.equal(g.real.left, false);
    assert.equal(g.vertical[0].heavy, false, 'first column is an ordinary line now');
    assert.equal(g.vertical[8].heavy, true, 'the opposite border is untouched');
    for (const l of g.horizontal) assert.equal(l.x1, 0, 'rows run off the left edge');
    for (const l of g.horizontal) assert.equal(l.x2, g.px(8), 'and still stop at the right border');
  });

  it('each side opens independently', () => {
    const sides = ['left', 'right', 'top', 'bottom'] as const;
    for (const side of sides) {
      const g = gridGeometry(view, dims, { ...NO_OPEN_EDGES, [side]: true }, W);
      assert.deepEqual(
        sides.filter((s) => !g.real[s]),
        [side],
      );
    }
  });

  it('with every border removed there are no heavy lines and all lines run off the picture', () => {
    const all = { top: true, right: true, bottom: true, left: true };
    const g = gridGeometry(view, dims, all, W);
    assert.ok([...g.vertical, ...g.horizontal].every((l) => !l.heavy));
    for (const l of g.vertical) assert.deepEqual([l.y1, l.y2], [0, g.height]);
    for (const l of g.horizontal) assert.deepEqual([l.x1, l.x2], [0, W]);
  });

  it('a view cropped away from the board edge shows no border there, open flag or not', () => {
    const big = { cols: 19, rows: 19 };
    const crop = { x0: 6, x1: 14, y0: 0, y1: 8 };
    const g = gridGeometry(crop, big, NO_OPEN_EDGES, W);
    assert.deepEqual(g.real, { left: false, right: false, top: true, bottom: false });
    assert.equal(g.vertical[0].heavy, false);
  });

  it('sizes the picture to the view: wider views are shorter per cell, taller views are taller', () => {
    const wide = gridGeometry(fullViewport({ cols: 19, rows: 5 }), { cols: 19, rows: 5 }, NO_OPEN_EDGES, W);
    const square = gridGeometry(fullViewport({ cols: 9, rows: 9 }), { cols: 9, rows: 9 }, NO_OPEN_EDGES, W);
    assert.ok(wide.cell < square.cell);
    assert.ok(wide.height < square.height);
    assert.equal(wide.width, W);
    // a rectangle's picture keeps the board's aspect ratio (cells stay square)
    assert.ok(Math.abs(wide.height / wide.cell - (4 + 1.6)) < 1e-9);
  });
});

describe('editor quick-pick sizes', () => {
  it('offers exactly the requested sizes, in order', () => {
    assert.deepEqual(
      BOARD_PRESETS.map((d) => `${d.cols}x${d.rows}`),
      ['19x19', '19x10', '13x13', '13x7', '9x9', '7x7', '7x5'],
    );
  });

  it('every preset is a valid size that round-trips through SGF and has no duplicates', () => {
    const seen = new Set<string>();
    for (const d of BOARD_PRESETS) {
      assert.deepEqual(parseSize(formatSize(d)), d);
      assert.ok(!seen.has(formatSize(d)), `duplicate ${formatSize(d)}`);
      seen.add(formatSize(d));
    }
  });

  it('a puzzle on each preset validates, and resizing between them keeps what fits', () => {
    for (const d of BOARD_PRESETS) {
      const sgf = `(;SZ[${formatSize(d)}]AB[aa]AW[ba];B[ab]TE[1])`;
      assert.deepEqual(validateSgf(sgf).errors, [], formatSize(d));
      assert.deepEqual(new StudyEngine(sgf, 'unguided').dims, d);
    }
    const root: SgfNode = { props: {}, children: [], parent: null };
    const r = resizeSetup([pt('aa'), pt('ra')], [pt('aj')], root, { cols: 19, rows: 19 }, { cols: 19, rows: 10 });
    assert.equal(r.dropped, 0, '19x10 still holds column 19 and row 10');
    const small = resizeSetup([pt('aa'), pt('ra')], [pt('aj')], root, { cols: 19, rows: 19 }, { cols: 7, rows: 5 });
    assert.deepEqual([small.black.length, small.white.length, small.dropped], [1, 0, 2]);
  });
});
