/**
 * Import pipeline, independent of React so it can be tested: bytes/text -> reviewable entries -> Problems.
 * The import screen's "Choose files" and "Add pasted text" buttons call exactly these functions.
 */
import type { Problem } from '../data/samples';
import { baseName, expandFile } from './archive';
import { layoutPaths, placeAll } from './folders';
import { decodeSgfBytes } from './encoding';
import { prepareSgf } from './normalize';
import { splitCollection } from './parser';
import { type Validation, validateSgf } from './validate';

export interface BatchItem {
  name: string;
  text: string;
  /** e.g. "gbk (detected)"; unset for plain UTF-8 */
  encoding?: string;
  /** the folder or archive the file was in: the suggested collection name */
  collection?: string;
  /** folders below that, "a/b" */
  folder?: string;
}

export interface Entry {
  key: string;
  title: string;
  sgf: string;
  norm: string;
  v: Validation;
  dup: boolean;
  include: boolean;
  encoding?: string;
  /** The suggested collection name: the file the puzzle came from when that file held several, or the folder/archive */
  collection?: string;
  /** Folders below the collection, "a/b" */
  folder?: string;
}

export const normalize = (s: string) => s.replace(/\s+/g, '');
let counter = 0;

/**
 * "Choose files": unpack .gz / .zip (a zip may hold several files, in folders) and decode each file's text. Throws on
 * bad archives. The folders inside a zip become the folders of the collection.
 */
export function readPickedFile(name: string, bytes: Uint8Array): BatchItem[] {
  const files = expandFile(name, bytes);
  const { collection, items } = layoutPaths(
    files.map((f) => f.name),
    baseName(name),
  );
  return files.map((f, i) => {
    const d = decodeSgfBytes(f.bytes);
    const encoding = d.how === 'utf8' || d.how === 'bom' ? undefined : `${d.encoding} (${d.how})`;
    return { name: baseName(items[i].name), text: d.text, encoding, collection, folder: items[i].folder };
  });
}

const PUZZLE_FILE = /.(sgf|txt|gz|zip)$/i;

/**
 * "Choose folder": the files of a picked folder (paths like "Tesuji/Part 1/001.sgf") as batch items. The top folder
 * is the suggested collection name and the folders below it are kept. Files that are not puzzles are skipped.
 */
export function readPickedFolder(files: { path: string; bytes: Uint8Array }[]): BatchItem[] {
  const wanted = files.filter((f) => PUZZLE_FILE.test(f.path));
  const { collection, items } = layoutPaths(wanted.map((f) => f.path));
  return wanted.flatMap((f, i) =>
    readPickedFile(items[i].name, f.bytes).map((b) => ({
      ...b,
      collection: b.collection ?? collection,
      folder: [items[i].folder, b.folder].filter(Boolean).join('/') || undefined,
    })),
  );
}

/** Turn raw text (one tree or a whole collection) into reviewable entries. */
export function makeEntries(
  name: string,
  text: string,
  taken: Set<string>,
  encoding?: string,
  place: { collection?: string; folder?: string } = {},
): Entry[] {
  const trees = splitCollection(text);
  if (!trees.length) {
    const v: Validation = { errors: ['File is empty'], warnings: [], moves: 0 };
    return [{ key: `e${counter++}`, title: name, sgf: '', norm: '', v, dup: false, include: false, encoding }];
  }
  const prepared = trees.map((t) => {
    const p = prepareSgf(t);
    const v = validateSgf(p.sgf);
    v.warnings.unshift(...p.notes);
    return { p, v };
  });
  // Collections often reuse one GN for every puzzle ("GZP1"): number those instead of showing duplicates.
  const gnCount = new Map<string, number>();
  for (const { v } of prepared) if (v.title) gnCount.set(v.title, (gnCount.get(v.title) ?? 0) + 1);
  const multi = trees.length > 1;
  return prepared.map(({ p, v }, i) => {
    const norm = normalize(p.sgf);
    const dup = taken.has(norm);
    taken.add(norm);
    const unique = v.title && gnCount.get(v.title) === 1;
    const title = unique ? v.title! : multi ? `${v.title ?? name} #${i + 1}` : (v.title ?? name);
    return {
      key: `e${counter++}`,
      title,
      sgf: p.sgf,
      norm,
      v,
      dup,
      include: !v.errors.length && !dup,
      encoding,
      // a file that held several puzzles is a collection of its own, or a folder of the one it was found in
      collection: place.collection ?? (multi ? name : undefined),
      folder: multi && place.collection ? [place.folder, name].filter(Boolean).join('/') : place.folder,
    };
  });
}

/**
 * Add a batch (picked files or pasted text) to the review list. `existing` holds the normalized SGF of
 * everything already in the library, so re-imports are flagged as duplicates.
 */
export function addToBatch(prev: Entry[], existing: Set<string>, batch: BatchItem[]): Entry[] {
  const taken = new Set([...existing, ...prev.map((e) => e.norm)]);
  return [
    ...prev,
    ...batch.flatMap((b) =>
      makeEntries(b.name, b.text, taken, b.encoding, { collection: b.collection, folder: b.folder }),
    ),
  ];
}

export const toggleEntry = (entries: Entry[], key: string): Entry[] =>
  entries.map((e) => (e.key === key && !e.v.errors.length ? { ...e, include: !e.include } : e));

/** "Select valid": everything without errors that isn't a duplicate. */
export const selectValid = (entries: Entry[]): Entry[] =>
  entries.map((e) => ({ ...e, include: !e.v.errors.length && !e.dup }));

export const summarize = (entries: Entry[]) => ({
  total: entries.length,
  invalid: entries.filter((e) => e.v.errors.length).length,
  duplicates: entries.filter((e) => e.dup && !e.v.errors.length).length,
  selected: entries.filter((e) => e.include).length,
});

/**
 * "Import N": the checked entries as library problems. `collection` is the name the player chose for them: a name
 * puts them all in that collection (with folders where they came from several places), `null` puts them in none,
 * and leaving it out keeps what each entry came with.
 */
export function toProblems(entries: Entry[], now = Date.now(), collection?: string | null): Problem[] {
  const chosen = entries.filter((e) => e.include);
  const places =
    collection === undefined
      ? chosen.map((e) => ({ collection: e.collection, folder: e.folder }))
      : placeAll(chosen, collection);
  return chosen.map((e, i) => ({
    id: `c-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    title: e.title,
    sgf: e.sgf,
    collection: places[i].collection,
    folder: places[i].folder,
  }));
}
