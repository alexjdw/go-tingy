import { type SyncProvider, type SyncResult, syncOnce } from './engine';
import { type Snapshot, contentKey, mergeSnapshots } from './snapshot';

/** What this device remembers about syncing (saved on the device, not in the cloud). */
export interface SyncMeta {
  /** when the data last changed on this device (or arrived from the cloud) */
  updatedAt: number;
  lastSyncedAt: number | null;
  /** `contentKey` of the data as it was at the last sync: if it differs now, the player changed something since */
  syncedKey: string | null;
}

export const emptyMeta = (): SyncMeta => ({ updatedAt: 0, lastSyncedAt: null, syncedKey: null });

export type Content = Omit<Snapshot, 'updatedAt'>;

/** The device's data as a snapshot: stamped with the time of the last change, which is now if it changed since the last sync. */
export function stampLocal(content: Content, meta: SyncMeta, now: number): Snapshot {
  const snap: Snapshot = { ...content, updatedAt: meta.updatedAt };
  if (contentKey(snap) !== meta.syncedKey) snap.updatedAt = Math.max(now, meta.updatedAt);
  return snap;
}

/** Has anything changed since the last sync (so a sync is worth doing)? */
export const hasUnsyncedChanges = (content: Content, meta: SyncMeta): boolean =>
  contentKey({ ...content, updatedAt: 0 }) !== meta.syncedKey;

export interface RunResult {
  result: SyncResult;
  /** save this; unchanged if the cloud file was damaged and left alone */
  meta: SyncMeta;
}

/** One sync of the device's data. The caller applies `result.merged` to the app when `result.changedLocal`. */
export async function runSync(
  provider: SyncProvider,
  content: Content,
  meta: SyncMeta,
  now: number,
  opts: { replaceDamaged?: boolean } = {},
): Promise<RunResult> {
  const local = stampLocal(content, meta, now);
  // a device that has never synced must not let its "newer" stamp wipe the cloud's lists and settings
  const result = await syncOnce(provider, local, { ...opts, first: meta.syncedKey === null });
  if (result.remoteDamaged) return { result, meta };
  return {
    result,
    meta: { updatedAt: result.merged.updatedAt, lastSyncedAt: now, syncedKey: contentKey(result.merged) },
  };
}

const dataKey = (c: Content) => contentKey({ ...c, updatedAt: 0 });

/**
 * What to put in the app after a sync that `sent` the device's data and got `result` back. The sync takes a while, so
 * the player may have changed things meanwhile (`current` differs from `sent`): applying `result.merged` as it is would
 * throw those changes away. Then the merge is merged again with what is on the device now, which wins where they
 * disagree; the changes also stay unsynced, so the next sync uploads them. Null when there is nothing to apply.
 */
export function applyAfterSync(sent: Content, current: Content, result: SyncResult, now: number): Snapshot | null {
  const changedMeanwhile = dataKey(sent) !== dataKey(current);
  if (!changedMeanwhile) return result.changedLocal ? result.merged : null;
  if (!result.changedLocal) return null; // the device already holds everything, and more
  return mergeSnapshots({ ...current, updatedAt: Math.max(now, result.merged.updatedAt + 1) }, result.merged);
}
