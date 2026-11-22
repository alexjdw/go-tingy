export interface Problem {
  id: string;
  title: string;
  sgf: string;
  /** Source collection (file name) for puzzles imported from a multi-puzzle file. */
  collection?: string;
  builtin?: boolean;
}

/** Small demo set. Import your own SGFs in the app; wrong branches use BM[1] or "Wrong" comments. */
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
    id: 'sample-33-invasion',
    title: '3-3 invasion (demo sequence)',
    builtin: true,
    sgf: `(;GM[1]FF[4]SZ[19]PL[W]AB[dd]C[White invades at the 3-3 point.]
      (;W[cc]
        (;B[cd]C[Block from below.]
          (;W[dc]
            (;B[ec]C[Hane on top.]))
          (;W[bd]C[Hane at the bottom.]
            (;B[ce]C[Cut off the hane stone.])))
        (;B[dc]C[Block from the side.]
          (;W[cd]
            (;B[ce]C[Hane underneath.])))))`,
  },
];
