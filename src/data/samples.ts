export interface Problem {
  id: string;
  title: string;
  sgf: string;
  /** Source collection (file name) for puzzles imported from a multi-puzzle file. */
  collection?: string;
  builtin?: boolean;
}

/**
 * The built-in starter puzzles. They are deliberately simple "capture the stones" problems whose answers can be
 * checked from the rules alone (see tests/samples.test.ts). Real study material comes from importing SGF files.
 */
export const SAMPLES: Problem[] = [
  {
    id: 'sample-capture-1',
    title: 'Corner capture',
    builtin: true,
    sgf: `(;GM[1]FF[4]SZ[19]PL[B]AB[aa][bb]AW[ab]C[Black to play: capture the stone.]
      (;B[ac]C[Correct!]))`,
  },
  {
    id: 'sample-capture-2',
    title: 'Edge pair in atari',
    builtin: true,
    sgf: `(;GM[1]FF[4]SZ[19]PL[B]AB[aa][bb][bc]AW[ab][ac]C[Black to play.]
      (;B[ad]C[Correct! Both stones are captured.]))`,
  },
  {
    id: 'sample-capture-3',
    title: 'Capture in the open',
    builtin: true,
    sgf: `(;GM[1]FF[4]SZ[19]PL[B]AB[dc][cd][ed]AW[dd]C[Black to play: the white stone has one liberty left.]
      (;B[de]C[Correct! The stone is captured.]))`,
  },
  {
    id: 'sample-capture-4',
    title: 'Capture two stones',
    builtin: true,
    sgf: `(;GM[1]FF[4]SZ[19]PL[B]AB[dc][ec][cd][fd][de]AW[dd][ed]C[Black to play: find the last liberty of the white pair.]
      (;B[ee]C[Correct! Both stones are captured.]))`,
  },
];
