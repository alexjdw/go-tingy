import { Pressable, StyleSheet, Text, View } from 'react-native';
import { describeFinding, describeVerdict } from '../../analysis/describe';
import type { Review } from '../../analysis/review';
import type { Problem } from '../../data/samples';
import type { Dims } from '../../sgf/parser';
import { Btn, theme } from './theme';

/** Where KataGo's check of a puzzle, run before saving, stands. */
export type Check =
  | { kind: 'running' }
  | { kind: 'failed'; message: string; problem: Problem; signature: string }
  | { kind: 'done'; review: Review; problem: Problem; signature: string };

const MAX_SHOWN = 6;

interface Props {
  check: Check;
  dims: Dims;
  /** go to the position of a finding in the tree */
  onJump: (key: string) => void;
  onSaveAnyway: () => void;
  onDismiss: () => void;
}

/** The result of the check before saving: what KataGo disagrees with (tap a line to see the position), and a choice. */
export function CheckPanel({ check, dims, onJump, onSaveAnyway, onDismiss }: Props) {
  if (check.kind === 'running') return <Text style={styles.hint}>KataGo is checking the puzzle…</Text>;
  const findings = check.kind === 'done' ? check.review.findings : [];
  return (
    <View style={styles.box} accessibilityLabel="KataGo's check">
      <Text style={styles.title}>
        {check.kind === 'failed'
          ? `KataGo could not check the puzzle: ${check.message}`
          : describeVerdict(check.review.verdict)}
      </Text>
      {findings.slice(0, MAX_SHOWN).map((f, i) => (
        <Pressable key={i} onPress={() => onJump(f.key)} accessibilityRole="button">
          <Text style={styles.finding}>{describeFinding(f, dims)}</Text>
        </Pressable>
      ))}
      {findings.length > MAX_SHOWN ? <Text style={styles.hint}>…and {findings.length - MAX_SHOWN} more.</Text> : null}
      {check.kind === 'done' && check.review.truncated ? (
        <Text style={styles.hint}>The puzzle is long, so only the first part was checked.</Text>
      ) : null}
      <Text style={styles.hint}>KataGo is a second opinion, not a proof: it can be wrong about life and death.</Text>
      <View style={styles.row}>
        <Btn label="Keep editing" onPress={onDismiss} />
        <Btn label="Save anyway" kind="ghost" onPress={onSaveAnyway} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, backgroundColor: theme.card, borderRadius: 8, padding: 12 },
  title: { color: theme.text, fontSize: 15, fontWeight: '700' },
  finding: { color: theme.text, fontSize: 14, textDecorationLine: 'underline' },
  hint: { color: theme.muted, fontSize: 14 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
