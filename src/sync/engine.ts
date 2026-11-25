import { type Snapshot, mergeSnapshots, parseSnapshot, sameContent, stringifySnapshot } from './snapshot';

/** A place the snapshot is kept in the cloud. Google Drive is the only one so far (`src/sync/drive.ts`). */
export interface SyncProvider {
  /** The stored text, or null if nothing has been saved yet. */
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

/** The cloud account is not signed in or the sign-in expired: the player has to sign in again. */
export class SignInRequired extends Error {
  constructor() {
    super('Sign in again to sync');
  }
}

export interface SyncResult {
  /** what both the device and the cloud hold now; apply it to local storage */
  merged: Snapshot;
  /** the cloud copy was changed */
  uploaded: boolean;
  /** the device's copy differs from `merged`, so the caller must save it */
  changedLocal: boolean;
  /** the cloud file could not be read as a snapshot; it was left untouched and nothing was uploaded */
  remoteDamaged: boolean;
}

/**
 * One sync: read the cloud copy, merge it with the device's, and upload the result if the cloud copy was missing or
 * out of date. A damaged cloud file is never overwritten (the caller can tell the player and offer to replace it).
 */
export async function syncOnce(
  provider: SyncProvider,
  local: Snapshot,
  opts: { replaceDamaged?: boolean; first?: boolean } = {},
): Promise<SyncResult> {
  const text = await provider.read();
  const remote = text === null ? null : parseSnapshot(text);
  if (text !== null && !remote && !opts.replaceDamaged)
    return { merged: local, uploaded: false, changedLocal: false, remoteDamaged: true };
  const merged = remote ? mergeSnapshots(local, remote, { first: opts.first }) : local;
  const uploaded = !remote || !sameContent(merged, remote);
  if (uploaded) await provider.write(stringifySnapshot(merged));
  return { merged, uploaded, changedLocal: !sameContent(merged, local), remoteDamaged: false };
}
