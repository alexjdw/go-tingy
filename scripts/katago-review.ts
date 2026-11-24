/**
 * Ask KataGo for a second opinion on puzzles.
 *
 *   npx tsx scripts/katago-review.ts <file-or-folder of .sgf> [--visits 400] [--limit 20]
 *
 * Needs KATAGO_EXE, KATAGO_MODEL and KATAGO_CONFIG in the environment (see store/ docs or the KataGo releases).
 * Prints, per puzzle, where the engine disagrees with the tree's markings or sees moves the tree lacks.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { reviewPuzzle, suggestedMarks } from '../src/analysis/review';
import { coordName, boardDims, parseSgf, splitCollection } from '../src/sgf/parser';
import { KataGoProcess } from './katago-process';

function collect(path: string): string[] {
  if (statSync(path).isDirectory()) return readdirSync(path).flatMap((f) => collect(join(path, f)));
  return /\.sgf$/i.test(path) ? [path] : [];
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string, d: number) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : d;
  };
  const target = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  const exe = process.env.KATAGO_EXE;
  const model = process.env.KATAGO_MODEL;
  const config = process.env.KATAGO_CONFIG;
  if (!target || !exe || !model || !config) {
    console.error(
      'usage: katago-review.ts <sgf file or folder> [--visits N] [--limit N]; set KATAGO_EXE, KATAGO_MODEL, KATAGO_CONFIG',
    );
    process.exit(2);
  }
  const limit = opt('--limit', 20);
  const engine = new KataGoProcess({ exe, model, config });
  let done = 0;
  try {
    for (const file of collect(target)) {
      for (const sgf of splitCollection(readFileSync(file, 'utf8'))) {
        if (done++ >= limit) return;
        const dims = boardDims(parseSgf(sgf));
        const review = await reviewPuzzle(sgf, engine, { maxVisits: opt('--visits', 400) });
        const name = (p: { x: number; y: number } | null) => (p ? coordName(p, dims) : 'pass');
        const marks = suggestedMarks(review);
        const where = review.firstDivergence !== null ? ` at ${review.firstDivergence || '(start)'}` : '';
        const notes = [
          `${review.nodes.length} positions`,
          `suggests ${marks.correct.length} correct, ${marks.wrong.length} wrong`,
          review.hasCorrectMarks ? '' : 'no correct marks',
          review.truncated ? 'stopped at the query limit' : '',
        ].filter(Boolean);
        console.log(`${basename(file)} #${done}: ${review.verdict}${where} (${notes.join('; ')})`);
        if (args.includes('--verbose')) {
          for (const f of review.findings) console.log(`    ${f.kind} at ${f.key || '(start)'} ${name(f.point)}`);
        }
      }
    }
  } finally {
    engine.close();
  }
}

void main();
