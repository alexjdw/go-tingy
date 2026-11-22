import { StyleSheet, Text, View } from 'react-native';
import type { Settings, Tri } from '../../storage/settings';
import { Btn, theme } from '../components/theme';

const ROWS: { key: keyof Settings; title: string; desc: string }[] = [
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
];

const OPTIONS: Tri[] = ['on', 'random', 'off'];

export function SettingsScreen({
  settings,
  onChange,
  onBack,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.wrap}>
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
