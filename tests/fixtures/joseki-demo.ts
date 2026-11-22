/**
 * A branching two-color sequence used as test data for guided/explore play and book moves. It is a demo
 * shape, not verified Go teaching material, which is why it lives with the tests and not in the app.
 */
export const JOSEKI_DEMO = `(;GM[1]FF[4]SZ[19]PL[W]AB[dd]C[White invades at the 3-3 point.]
  (;W[cc]
    (;B[cd]C[Block from below.]
      (;W[dc]
        (;B[ec]C[Hane on top.]))
      (;W[bd]C[Hane at the bottom.]
        (;B[ce]C[Cut off the hane stone.])))
    (;B[dc]C[Block from the side.]
      (;W[cd]
        (;B[ce]C[Hane underneath.])))))`;
