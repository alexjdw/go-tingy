import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StatSection } from '../../progress/stats';
import { Btn, theme } from './theme';

/** The stats as lines of text, grouped by mode. `small` is the hover card over a tile. */
export function StatsLines({ sections, small }: { sections: StatSection[]; small?: boolean }) {
  return (
    <View style={{ gap: small ? 4 : 10 }}>
      {sections.map((s) => (
        <View key={s.title} style={{ gap: small ? 0 : 2 }}>
          <Text style={[styles.heading, small && styles.headingSmall]}>{s.title}</Text>
          {s.rows.map((r) => (
            <Text key={r.label} style={[styles.row, small && styles.rowSmall]} numberOfLines={small ? 2 : undefined}>
              <Text style={styles.label}>{r.label}: </Text>
              {r.value}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Shown while the pointer is over a tile: it covers the picture and title, never the buttons. */
export function StatsHover({ sections }: { sections: StatSection[] }) {
  return (
    <View pointerEvents="none" accessibilityLabel="Puzzle stats" style={styles.hover}>
      <StatsLines sections={sections} small />
    </View>
  );
}

/** Shown after a long press on a tile. */
export function StatsSheet({
  title,
  sections,
  onClose,
}: {
  title: string;
  sections: StatSection[];
  onClose: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close stats">
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityViewIsModal>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <StatsLines sections={sections} />
          <Btn label="Close" kind="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  heading: { color: theme.text, fontSize: 14, fontWeight: '800' },
  headingSmall: { fontSize: 11 },
  row: { color: theme.text, fontSize: 14 },
  rowSmall: { fontSize: 11 },
  label: { color: theme.muted },
  hover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 60, // the action buttons stay clickable
    backgroundColor: 'rgba(20,22,26,0.94)',
    borderRadius: 12,
    padding: 10,
    overflow: 'hidden',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { backgroundColor: theme.card, borderRadius: 14, padding: 18, gap: 12, width: '100%', maxWidth: 420 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
});
