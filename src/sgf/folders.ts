/**
 * Collections are folders of puzzles: a collection has a name, and its puzzles can sit in sub-folders
 * (`Problem.folder`, a path like "Part 1/Peep"). Pure functions for naming, laying out and browsing them.
 */
import type { Problem } from '../data/samples';

/** The parts of a path, split on / and \, without empty, "." or ".." parts. */
export const pathParts = (p: string): string[] => p.split(/[\\/]/).filter((s) => s && s !== '.' && s !== '..');

export interface PlacedFile {
  /** file name without its folders */
  name: string;
  /** folders below the collection, joined with "/" */
  folder?: string;
}

/**
 * Lay out the paths found in a picked folder or an archive. When every path sits inside one top-level folder, that
 * folder is the suggested collection name and is dropped from the paths. Otherwise `label` (the archive name) is the
 * suggestion. A lone file with no folders is not part of any collection.
 */
export function layoutPaths(paths: string[], label?: string): { collection?: string; items: PlacedFile[] } {
  const parts = paths.map(pathParts);
  const dirs = parts.map((p) => p.slice(0, -1));
  const names = parts.map((p) => p[p.length - 1] ?? '');
  const anyDirs = dirs.some((d) => d.length > 0);
  if (paths.length < 2 && !anyDirs) return { items: names.map((name) => ({ name })) };
  const root = dirs.every((d) => d.length > 0 && d[0] === dirs[0][0]) ? dirs[0][0] : undefined;
  const inner = root ? dirs.map((d) => d.slice(1)) : dirs;
  return {
    collection: root ?? label,
    items: names.map((name, i) => ({ name, folder: inner[i].length ? inner[i].join('/') : undefined })),
  };
}

/** The line under a puzzle tile: its collection, and the last folder it sits in. */
export const captionOf = (p: Problem): string | undefined =>
  p.collection ? [p.collection, p.folder?.split('/').pop()].filter(Boolean).join(' › ') : undefined;

/** The collections in a library, with how many puzzles each holds (in order of first appearance). */
export function collectionsOf(problems: Problem[]): [string, number][] {
  const m = new Map<string, number>();
  for (const p of problems) if (p.collection) m.set(p.collection, (m.get(p.collection) ?? 0) + 1);
  return [...m.entries()];
}

/** Is the puzzle in `folder` (a path) of its collection, or in a folder below it? An empty path is the whole collection. */
export const inFolder = (p: Problem, folder: string | null): boolean =>
  !folder || p.folder === folder || (p.folder ?? '').startsWith(folder + '/');

/**
 * The folders one level below `folder` (null: the top of the collection) in a collection, with how many puzzles
 * each holds, including everything inside it. Puzzles directly in `folder` are not listed.
 */
export function childFolders(problems: Problem[], collection: string, folder: string | null): [string, number][] {
  const prefix = folder ? folder + '/' : '';
  const m = new Map<string, number>();
  for (const p of problems) {
    if (p.collection !== collection || !p.folder || !p.folder.startsWith(prefix)) continue;
    const next = p.folder.slice(prefix.length).split('/')[0];
    if (next) m.set(next, (m.get(next) ?? 0) + 1);
  }
  return [...m.entries()];
}

/** Rename a collection; if `to` is the name of another collection, the two are merged. Empty names change nothing. */
export function renameCollection(problems: Problem[], from: string, to: string): Problem[] {
  const name = to.trim();
  if (!name || name === from) return problems;
  return problems.map((p) => (p.collection === from ? { ...p, collection: name } : p));
}

/** Where an imported puzzle goes. */
export interface Placement {
  collection?: string;
  folder?: string;
}

/**
 * Name the places of imported puzzles. `collection` is what each came with (the file, folder or archive it was in)
 * and `folder` the folders below that. With a `name`, every puzzle goes into that collection; when the puzzles
 * came from several files or archives, each of those becomes a folder of its own. With `null` (or an empty name)
 * the puzzles belong to no collection.
 */
export function placeAll(items: { collection?: string; folder?: string }[], name: string | null): Placement[] {
  const label = name?.trim();
  if (!label) return items.map(() => ({}));
  const sources = new Set(items.map((i) => i.collection).filter(Boolean));
  return items.map((i) => {
    const parts = [sources.size > 1 ? i.collection : undefined, i.folder].filter(Boolean);
    return { collection: label, folder: parts.length ? parts.join('/') : undefined };
  });
}

/** A name to offer when the player is asked what to call the imported collection. */
export function suggestName(items: { collection?: string }[]): string {
  const count = new Map<string, number>();
  for (const i of items) if (i.collection) count.set(i.collection, (count.get(i.collection) ?? 0) + 1);
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'New collection';
}
