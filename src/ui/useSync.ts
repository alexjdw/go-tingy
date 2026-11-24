import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSyncSettings, saveSyncSettings } from '../storage/syncState';
import { createDriveProvider } from '../sync/drive';
import { SignInRequired } from '../sync/engine';
import { type Content, type SyncMeta, emptyMeta, hasUnsyncedChanges, runSync } from '../sync/run';
import type { Snapshot } from '../sync/snapshot';
import { getToken, signIn, signOut, syncAvailable } from './googleAuth';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'signin' | 'error' | 'damaged';

/** Wait this long after the last change before uploading, so a burst of moves is one upload. */
const DEBOUNCE_MS = 15_000;
/** Sync again on returning to the tab only if the last sync was at least this long ago. */
const REFOCUS_MS = 60_000;

export interface SyncApi {
  available: boolean;
  connected: boolean;
  status: SyncStatus;
  message: string;
  lastSyncedAt: number | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: (opts?: { replaceDamaged?: boolean }) => Promise<void>;
}

/**
 * Keeps the player's data in step with their Google Drive. `getContent` returns the data as it is now; `apply` stores a
 * merged snapshot back in the app. Nothing happens while `busy` (a puzzle is open) or before the data has loaded.
 */
export function useSync(o: {
  ready: boolean;
  busy: boolean;
  getContent: () => Content;
  apply: (merged: Snapshot) => void;
  /** changes whenever the data does */
  version: unknown;
}): SyncApi {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<SyncStatus>('off');
  const [message, setMessage] = useState('');
  const [meta, setMeta] = useState<SyncMeta>(emptyMeta());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const metaRef = useRef(meta);
  const running = useRef(false);
  const latest = useRef(o);
  useEffect(() => {
    latest.current = o;
  });

  useEffect(() => {
    if (!syncAvailable) return;
    void loadSyncSettings().then((s) => {
      metaRef.current = s.meta;
      setMeta(s.meta);
      setConnected(s.connected);
      setStatus(s.connected ? 'idle' : 'off');
      setSettingsLoaded(true);
    });
  }, []);

  const syncNow = useCallback(async (opts: { replaceDamaged?: boolean } = {}) => {
    if (running.current || !latest.current.ready) return;
    running.current = true;
    setStatus('syncing');
    setMessage('');
    try {
      const provider = createDriveProvider({ getToken });
      const { result, meta: next } = await runSync(
        provider,
        latest.current.getContent(),
        metaRef.current,
        Date.now(),
        opts,
      );
      if (result.remoteDamaged) {
        setStatus('damaged');
        setMessage('The copy in Google Drive is damaged, so nothing was changed.');
        return;
      }
      if (result.changedLocal) latest.current.apply(result.merged);
      metaRef.current = next;
      setMeta(next);
      await saveSyncSettings({ connected: true, meta: next });
      setStatus('idle');
    } catch (e) {
      if (e instanceof SignInRequired) {
        setStatus('signin');
        setMessage('Sign in to Google again to keep syncing.');
      } else {
        setStatus('error');
        setMessage(e instanceof Error ? e.message : 'Sync failed');
      }
    } finally {
      running.current = false;
    }
  }, []);

  const connect = useCallback(async () => {
    const t = await signIn();
    if (!t) {
      setMessage('Google sign-in was cancelled or blocked.');
      return;
    }
    setConnected(true);
    await saveSyncSettings({ connected: true, meta: metaRef.current });
    await syncNow();
  }, [syncNow]);

  const disconnect = useCallback(async () => {
    await signOut();
    const fresh = emptyMeta();
    metaRef.current = fresh;
    setMeta(fresh);
    setConnected(false);
    setStatus('off');
    setMessage('');
    await saveSyncSettings({ connected: false, meta: fresh });
  }, []);

  const can = connected && settingsLoaded && o.ready && !o.busy && status !== 'signin' && status !== 'damaged';

  // on opening the app, once the data and the saved settings have loaded
  const first = useRef(true);
  useEffect(() => {
    if (!can || !first.current) return;
    first.current = false;
    void syncNow();
  }, [can, syncNow]);

  // after changes
  useEffect(() => {
    if (!can || first.current) return;
    if (!hasUnsyncedChanges(latest.current.getContent(), metaRef.current)) return;
    const t = setTimeout(() => void syncNow(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [can, o.version, syncNow]);

  // coming back to the tab or the home-screen app: another device may have changed things
  useEffect(() => {
    if (!can || typeof document === 'undefined') return;
    const onShow = () => {
      const last = metaRef.current.lastSyncedAt ?? 0;
      if (document.visibilityState === 'visible' && Date.now() - last > REFOCUS_MS) void syncNow();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [can, syncNow]);

  return {
    available: syncAvailable,
    connected,
    status,
    message,
    lastSyncedAt: meta.lastSyncedAt,
    connect,
    disconnect,
    syncNow,
  };
}
