import { Modal, StyleSheet, Text, View } from 'react-native';
import { LearningBadge } from './LearningBadge';
import { Btn, theme } from './theme';

interface Props {
  /** the puzzle that just reached diamond; the prompt is closed when null */
  title: string | null;
  /** it is in spaced repetition already, so its spaced score stays as it is */
  inSpaced: boolean;
  onMove: () => void;
  onKeep: () => void;
}

/** A guided-learning puzzle reached diamond: offer to move it over to spaced repetition. */
export function DiamondPrompt({ title, inSpaced, onMove, onKeep }: Props) {
  return (
    <Modal transparent visible={title !== null} animationType="fade" onRequestClose={onKeep}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.badge}>
            <LearningBadge mark="diamond" />
          </View>
          <Text style={styles.title}>Diamond!</Text>
          <Text style={styles.text}>
            {title} has reached diamond. Move it to spaced repetition?
            {inSpaced
              ? ' It is already there, so its review schedule stays as it is.'
              : ' It will start there with a high score, so it comes back for review only after a few weeks.'}
          </Text>
          <Btn label="Yes, move it" onPress={onMove} />
          <Btn label="No, keep it in guided learning" kind="ghost" onPress={onKeep} />
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
  badge: { alignItems: 'center' },
  title: { color: theme.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  text: { color: theme.text, fontSize: 15 },
});
