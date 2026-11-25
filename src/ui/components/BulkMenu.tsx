import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../../progress/learning';
import { Btn, theme } from './theme';

interface Props {
  /** the collection or folder; the menu is closed when null */
  title: string | null;
  /** how many puzzles it holds, folders inside it included */
  total: number;
  /** how many of them are in each study mode already */
  have: Record<Category, number>;
  onToggle: (category: Category, on: boolean) => void;
  onClose: () => void;
}

const NAMES: Record<Category, string> = { spaced: 'spaced repetition', learning: 'guided learning' };

/** Long press (or double tap) on a collection or folder: add all its puzzles to a study mode, or remove them. */
export function BulkMenu({ title, total, have, onToggle, onClose }: Props) {
  return (
    <Modal transparent visible={title !== null} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityViewIsModal>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.sub}>
            {total} puzzle{total === 1 ? '' : 's'}, with everything in its folders.
          </Text>
          {(['spaced', 'learning'] as Category[]).map((c) => (
            <View key={c} style={styles.group}>
              <Text style={styles.sub}>
                {have[c]} of {total} already in {NAMES[c]}
              </Text>
              <Btn label={`Add all to ${NAMES[c]}`} disabled={have[c] >= total} onPress={() => onToggle(c, true)} />
              <Btn
                label={`Remove all from ${NAMES[c]}`}
                kind="ghost"
                disabled={have[c] === 0}
                onPress={() => onToggle(c, false)}
              />
            </View>
          ))}
          <Btn label="Close" kind="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
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
  sheet: { backgroundColor: theme.card, borderRadius: 14, padding: 18, gap: 12, width: '100%', maxWidth: 420 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  sub: { color: theme.muted, fontSize: 13 },
  group: { gap: 6 },
});
