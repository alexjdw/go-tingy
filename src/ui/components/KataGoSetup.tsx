import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { KataGoStatus } from '../../analysis/bridge';
import { setupGuide } from '../../analysis/setup';
import { Btn, theme } from './theme';

interface Props {
  status: KataGoStatus;
  /** why the help is shown, when KataGo is configured but failed to run */
  problem?: string;
  onCheckAgain: () => void;
  onOpenFolder?: () => void;
}

/** How to get KataGo and the network the app uses working on this computer, step by step. */
export function KataGoSetup({ status, problem, onCheckAgain, onOpenFolder }: Props) {
  const setup = status.setup;
  const guide = setup ? setupGuide(setup.platform, setup.arch) : null;
  return (
    <View style={styles.box} accessibilityLabel="KataGo setup">
      <Text style={styles.title}>{problem ? 'KataGo did not run' : 'Set up KataGo to use this'}</Text>
      <Text style={styles.text}>{problem ?? status.message}</Text>
      {guide && setup ? (
        <>
          <Text style={styles.sub}>
            Steps for {guide.os}
            {guide.tested ? '' : ' (not tried on this system)'}
          </Text>
          {guide.steps.map((step, i) => (
            <Text key={i} style={styles.text}>
              {i + 1}. {step}
            </Text>
          ))}
          <Text style={styles.sub}>The folder to put the files in:</Text>
          <Text style={[styles.text, styles.path]} selectable>
            {setup.folder}
          </Text>
          {guide.links.map((l) => (
            <Pressable key={l.url} onPress={() => void Linking.openURL(l.url)} accessibilityRole="link">
              <Text style={styles.link}>{l.label}</Text>
            </Pressable>
          ))}
          {guide.note ? <Text style={styles.hint}>{guide.note}</Text> : null}
          {guide.fallback ? <Text style={styles.hint}>{guide.fallback}</Text> : null}
        </>
      ) : null}
      <View style={styles.row}>
        {onOpenFolder ? <Btn label="Open the folder" kind="ghost" onPress={onOpenFolder} /> : null}
        <Btn label="Check again" onPress={onCheckAgain} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, backgroundColor: theme.card, borderRadius: 8, padding: 12 },
  title: { color: theme.text, fontSize: 16, fontWeight: '700' },
  sub: { color: theme.text, fontSize: 14, fontWeight: '600' },
  text: { color: theme.text, fontSize: 14 },
  hint: { color: theme.muted, fontSize: 14 },
  path: { fontFamily: 'monospace', color: theme.muted },
  link: { color: theme.accent, fontSize: 14, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
