import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { SyncApi } from '../useSync';

const CLOUD = 'M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17.5 18Z';

/** What the indicator says, from the sync state. Null when sync is not available in this build. */
export function syncIndicatorState(
  sync: SyncApi | undefined,
): { color: string; label: string; mark: 'check' | 'slash' | 'dot' } | null {
  if (!sync?.available) return null;
  if (!sync.connected) return { color: '#9aa0aa', label: 'Google Drive: not signed in', mark: 'slash' };
  if (sync.status === 'signin') return { color: '#f5c518', label: 'Google Drive: sign in again', mark: 'dot' };
  if (sync.status === 'error' || sync.status === 'damaged')
    return { color: '#e5484d', label: 'Google Drive: sync problem', mark: 'dot' };
  return { color: '#30a46c', label: 'Google Drive: signed in', mark: 'check' };
}

/** A small cloud: green with a check when signed in to Google Drive, grey and crossed out when not. Opens Settings. */
export function SyncIndicator({ sync, onPress }: { sync?: SyncApi; onPress: () => void }) {
  const s = syncIndicatorState(sync);
  if (!s) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={s.label} hitSlop={8}>
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Path d={CLOUD} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round" />
        {s.mark === 'check' ? (
          <Path d="M8.8 13.4l2.4 2.4 4.2-4.6" fill="none" stroke={s.color} strokeWidth={1.9} strokeLinecap="round" />
        ) : s.mark === 'slash' ? (
          <Path d="M4 4l16 16" fill="none" stroke={s.color} strokeWidth={1.9} strokeLinecap="round" />
        ) : (
          <Path d="M12 11.5v3M12 16.6v.2" fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" />
        )}
      </Svg>
    </Pressable>
  );
}
