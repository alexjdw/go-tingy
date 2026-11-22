import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Btn, theme } from './theme';

const STEPS = [
  {
    title: 'Follow the green dot',
    text: 'Some of the moves are given. Tap the green dot to play each one — for both Black and White — until the dots run out.',
  },
  {
    title: 'Then finish it yourself',
    text: 'When the given moves are used up, you solve the rest on your own. A wrong move counts as a mistake.',
  },
  {
    title: 'Fewer given moves each time',
    text: 'Every clean run gives you fewer moves, until you play the whole puzzle yourself. Then the timed mastery runs begin.',
  },
];

/** A short first-time introduction to guided mastery runs. */
export function RunTutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.count}>
            How guided learning works · {i + 1} of {STEPS.length}
          </Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.text}>{step.text}</Text>
          <View style={styles.row}>
            {last ? null : <Btn label="Skip" kind="ghost" onPress={onDone} />}
            <Btn label={last ? 'Got it' : 'Next'} onPress={last ? onDone : () => setI(i + 1)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { backgroundColor: theme.card, borderRadius: 14, padding: 18, gap: 10, width: '100%', maxWidth: 420 },
  count: { color: theme.muted, fontSize: 13 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  text: { color: theme.text, fontSize: 15 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
});
