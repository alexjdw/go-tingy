import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type StudyEngine } from '../src/study/engine';
import { readPickedFile } from '../src/sgf/importer';
import { splitCollection } from '../src/sgf/parser';
import { prepareSgf } from '../src/sgf/normalize';
import { validateSgf } from '../src/sgf/validate';

export const fixtureBytes = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, 'fixtures', name)));

/** Decompressed, decoded text of a fixture (what a user would see opening it, or paste from it). */
export const fixtureText = (name: string) =>
  readPickedFile(name, fixtureBytes(name))
    .map((b) => b.text)
    .join('\n');

/** The i-th puzzle in a fixture, normalized the way the importer stores it. */
export const fixtureProblem = (name: string, index: number) => prepareSgf(splitCollection(fixtureText(name))[index]).sgf;

/** Every puzzle in a fixture that passes validation, as stored sgf. */
export const validProblems = (name: string) =>
  splitCollection(fixtureText(name))
    .map((t) => prepareSgf(t).sgf)
    .filter((sgf) => !validateSgf(sgf).errors.length);

/** "ab" style SGF coordinate -> point. */
export const pt = (s: string) => ({ x: s.charCodeAt(0) - 97, y: s.charCodeAt(1) - 97 });

/**
 * Solve by following the book: at every learner turn play the first move that doesn't lead only to failure.
 * Returns the sequence of learner moves played. Throws if any move is rejected.
 */
export function solveByBook(e: StudyEngine, limit = 400): { x: number; y: number }[] {
  const played: { x: number; y: number }[] = [];
  while (e.snap.status !== 'solved') {
    if (played.length > limit) throw new Error('did not terminate');
    const [p] = e.bookMoves();
    if (!p) throw new Error('no book move available');
    const r = e.play(p);
    if (r === 'wrong' || r === 'illegal') throw new Error(`book move rejected (${r}) at ${p.x},${p.y}`);
    played.push(p);
  }
  return played;
}
