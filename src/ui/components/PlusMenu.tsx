import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../../progress/mastery';
import { Btn, theme } from './theme';

interface Props {
  /** the puzzle's name; the menu is closed when null */
  title: string | null;
  spaced: boolean;
  mastery: boolean;
  onToggle: (category: Category, on: boolean) => void;
  /** only for puzzles you made or imported */
  onEdit?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** The "+" menu: add the puzzle to (or remove it from) spaced repetition and mastery. */
export function PlusMenu({ title, spaced, mastery, onToggle, onEdit, onDelete, onClose }: Props) {
  return (
    <Modal transparent visible={title !== null} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityViewIsModal>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.sub}>Study this puzzle in:</Text>
          <Btn
            label={spaced ? '✓ Spaced repetition (tap to remove)' : 'Add to spaced repetition'}
            kind={spaced ? 'solid' : 'ghost'}
            onPress={() => onToggle('spaced', !spaced)}
          />
          <Btn
            label={mastery ? '✓ Mastery (tap to remove)' : 'Add to mastery'}
            kind={mastery ? 'solid' : 'ghost'}
            onPress={() => onToggle('mastery', !mastery)}
          />
          {onEdit || onDelete ? (
            <View style={styles.more}>
              {onEdit ? <Btn label="Edit puzzle" kind="ghost" onPress={onEdit} /> : null}
              {onDelete ? <Btn label="Delete puzzle" kind="ghost" onPress={onDelete} /> : null}
            </View>
          ) : null}
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
  sheet: { backgroundColor: theme.card, borderRadius: 14, padding: 18, gap: 10, width: '100%', maxWidth: 420 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  sub: { color: theme.muted, fontSize: 13 },
  more: { gap: 10, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2c3038' },
});
