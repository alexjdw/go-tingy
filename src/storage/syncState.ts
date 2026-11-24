import AsyncStorage from '@react-native-async-storage/async-storage';
import { type SyncMeta, emptyMeta } from '../sync/run';

const DELETED = 'deleted.v1';
const META = 'sync.v1';

/** Puzzle ids the player deleted -> when. Kept so a deletion reaches the player's other devices. */
export async function loadDeleted(): Promise<Record<string, number>> {
  try {
    const v: unknown = JSON.parse((await AsyncStorage.getItem(DELETED)) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}
export const saveDeleted = (d: Record<string, number>) => AsyncStorage.setItem(DELETED, JSON.stringify(d));

export interface SyncSettings {
  /** the player connected Google Drive on this device */
  connected: boolean;
  meta: SyncMeta;
}

export async function loadSyncSettings(): Promise<SyncSettings> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(META)) ?? '{}') as Partial<SyncSettings>;
    return { connected: v.connected === true, meta: { ...emptyMeta(), ...(v.meta ?? {}) } };
  } catch {
    return { connected: false, meta: emptyMeta() };
  }
}
export const saveSyncSettings = (s: SyncSettings) => AsyncStorage.setItem(META, JSON.stringify(s));
