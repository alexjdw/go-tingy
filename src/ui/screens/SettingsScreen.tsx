import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_BACKLOG_COUNT, MAX_BACKLOG_DAYS } from '../../progress/backlog';
import type { Settings, Tri } from '../../storage/settings';
import { NumberField } from '../components/NumberField';
import { Btn, theme } from '../components/theme';
import type { SyncApi } from '../useSync';

type TriKey = 'markChoices' | 'flipColors' | 'paper';

const ROWS: { key: TriKey; title: string; desc: string }[] = [
  {
    key: 'markChoices',
    title: 'Mark the correct choices',
    desc: 'Unguided only. Replays the problem up to a point with several good moves and asks you to mark all of them before you play one. On: always. Random: sometimes. Off: never.',
  },
  {
    key: 'flipColors',
    title: 'Flip colors',
    desc: 'Guided and unguided only. Swaps black and white so you learn the shape, not the colors. On: always. Random: each attempt. Off: never.',
  },
  {
    key: 'paper',
    title: 'Paper mode',
    desc: 'Solving only. Shows the puzzle as a still diagram: solve it in your head, tap Done, then say how it went. Your answer counts toward spaced repetition and guided learning scores. On: always. Random: sometimes. Off: never.',
  },
];

const OPTIONS: Tri[] = ['on', 'random', 'off'];

export function SettingsScreen({
  settings,
  onChange,
  onBack,
  onAbout,
  onPickBacklog,
  sync,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  onAbout?: () => void;
  /** open the screen where the puzzles to work on first are chosen */
  onPickBacklog?: () => void;
  sync?: SyncApi;
}) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.top}>
        <Btn label="‹ Back" kind="ghost" onPress={onBack} />
        <Text style={styles.h1}>Settings</Text>
      </View>
      {ROWS.map((r) => (
        <View key={r.key} style={styles.card}>
          <Text style={styles.title}>{r.title}</Text>
          <Text style={styles.desc}>{r.desc}</Text>
          <View style={styles.seg}>
            {OPTIONS.map((o) => (
              <Btn
                key={o}
                label={o[0].toUpperCase() + o.slice(1)}
                kind={settings[r.key] === o ? 'solid' : 'ghost'}
                onPress={() => onChange({ ...settings, [r.key]: o })}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.card}>
        <Text style={styles.title}>Work through a backlog</Text>
        <Text style={styles.desc}>
          For spaced repetition and guided learning. Choose how many puzzles to focus on and for how many days, then
          pick them: the ones you know least are listed first. Until the days are over they come first in the guided
          learning list, and first whenever they are due in spaced repetition.
        </Text>
        <View style={styles.seg}>
          <NumberField
            label="Puzzles"
            value={settings.backlogCount}
            min={1}
            max={MAX_BACKLOG_COUNT}
            onChange={(n) => onChange({ ...settings, backlogCount: n })}
          />
          <NumberField
            label="Days"
            value={settings.backlogDays}
            min={1}
            max={MAX_BACKLOG_DAYS}
            onChange={(n) => onChange({ ...settings, backlogDays: n })}
          />
        </View>
        {onPickBacklog ? <Btn label="Choose puzzles" onPress={onPickBacklog} /> : null}
      </View>
      {sync?.available ? <SyncCard sync={sync} /> : null}
      {onAbout ? <Btn label="About and licenses" kind="ghost" onPress={onAbout} /> : null}
    </ScrollView>
  );
}

const when = (t: number | null) => (t ? new Date(t).toLocaleString() : 'not yet');

/** Keep puzzles and progress in the player's own Google Drive, so every device they sign in on has them. */
function SyncCard({ sync }: { sync: SyncApi }) {
  const busy = sync.status === 'syncing';
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Sync with Google Drive</Text>
      <Text style={styles.desc}>
        Keeps your puzzles, progress and settings in a private, hidden folder of your own Google Drive, so every device
        you sign in on has them. The app can see only that folder, nothing else in your Drive.
      </Text>
      {sync.connected ? (
        <Text style={styles.desc}>
          {busy ? 'Syncing…' : `Last synced: ${when(sync.lastSyncedAt)}`}
          {sync.message ? `\n${sync.message}` : ''}
        </Text>
      ) : sync.message ? (
        <Text style={styles.desc}>{sync.message}</Text>
      ) : null}
      <View style={styles.seg}>
        {!sync.connected ? (
          <Btn label="Sign in with Google" onPress={() => void sync.connect()} />
        ) : (
          <>
            {sync.status === 'signin' ? (
              <Btn label="Sign in again" onPress={() => void sync.connect()} />
            ) : sync.status === 'damaged' ? (
              <Btn label="Replace the damaged copy" onPress={() => void sync.syncNow({ replaceDamaged: true })} />
            ) : (
              <Btn label={busy ? 'Syncing…' : 'Sync now'} kind="solid" onPress={() => void sync.syncNow()} />
            )}
            <Btn label="Sign out" kind="ghost" onPress={() => void sync.disconnect()} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h1: { color: theme.text, fontSize: 22, fontWeight: '800' },
  card: { backgroundColor: theme.card, borderRadius: 10, padding: 14, gap: 8 },
  title: { color: theme.text, fontSize: 16, fontWeight: '700' },
  desc: { color: theme.muted, fontSize: 13 },
  seg: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
