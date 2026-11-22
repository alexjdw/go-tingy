import type { Color, Point } from '../sgf/parser';

/** Immutable Go board with captures, suicide check and simple ko. */
export class Board {
  readonly cols: number;
  readonly rows: number;
  /** 0 empty, 1 black, 2 white */
  readonly grid: Uint8Array;
  /** Point forbidden by ko for the next move, or -1 */
  readonly ko: number;

  /** `new Board(19)` is square; `new Board(9, 5)` is 9 columns by 5 rows. */
  constructor(cols: number, rows: number = cols, grid?: Uint8Array, ko = -1) {
    this.cols = cols;
    this.rows = rows;
    this.grid = grid ?? new Uint8Array(cols * rows);
    this.ko = ko;
  }

  idx(p: Point) {
    return p.y * this.cols + p.x;
  }

  get(p: Point): Color | null {
    const v = this.grid[this.idx(p)];
    return v === 1 ? 'B' : v === 2 ? 'W' : null;
  }

  /** Setup placement (AB/AW/AE): no capture logic. */
  withStone(p: Point, color: Color | null): Board {
    const g = this.grid.slice();
    g[this.idx(p)] = color === 'B' ? 1 : color === 'W' ? 2 : 0;
    return new Board(this.cols, this.rows, g, -1);
  }

  private neighbors(i: number): number[] {
    const { cols, rows } = this;
    const x = i % cols;
    const y = (i / cols) | 0;
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < cols - 1) out.push(i + 1);
    if (y > 0) out.push(i - cols);
    if (y < rows - 1) out.push(i + cols);
    return out;
  }

  private group(g: Uint8Array, start: number): { stones: number[]; liberties: number } {
    const color = g[start];
    const seen = new Set<number>([start]);
    const libs = new Set<number>();
    const stack = [start];
    while (stack.length) {
      const c = stack.pop()!;
      for (const nb of this.neighbors(c)) {
        if (g[nb] === 0) libs.add(nb);
        else if (g[nb] === color && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    return { stones: [...seen], liberties: libs.size };
  }

  /** Returns the resulting board, or null if the move is illegal. */
  play(p: Point | null, color: Color): { board: Board; captured: number } | null {
    if (!p) return { board: new Board(this.cols, this.rows, this.grid, -1), captured: 0 }; // pass
    if (p.x < 0 || p.y < 0 || p.x >= this.cols || p.y >= this.rows) return null; // off the board
    const i = this.idx(p);
    if (this.grid[i] !== 0 || i === this.ko) return null;
    const me = color === 'B' ? 1 : 2;
    const opp = me === 1 ? 2 : 1;
    const g = this.grid.slice();
    g[i] = me;
    let captured = 0;
    let lastCapture = -1;
    for (const nb of this.neighbors(i)) {
      if (g[nb] === opp) {
        const grp = this.group(g, nb);
        if (grp.liberties === 0) {
          for (const s of grp.stones) g[s] = 0;
          captured += grp.stones.length;
          lastCapture = grp.stones[0];
        }
      }
    }
    const mine = this.group(g, i);
    if (mine.liberties === 0) return null; // suicide
    // simple ko: single stone captured by a single stone left in atari
    let ko = -1;
    if (captured === 1 && mine.stones.length === 1 && mine.liberties === 1) ko = lastCapture;
    return { board: new Board(this.cols, this.rows, g, ko), captured };
  }
}
