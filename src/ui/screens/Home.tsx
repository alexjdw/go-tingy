import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SyncIndicator } from '../components/SyncIndicator';
import { Btn, theme } from '../components/theme';
import type { SyncApi } from '../useSync';

interface Props {
  /** spaced-repetition puzzles due right now */
  dueCount: number;
  /** puzzles in spaced repetition, due or not */
  spacedCount: number;
  /** puzzles in learning */
  learningCount: number;
  /** learning puzzles that can be played today (they have an attempt left) */
  learningReady: number;
  puzzleCount: number;
  onLearning: () => void;
  onSpaced: () => void;
  onBrowse: () => void;
  onSettings: () => void;
  /** Google Drive sync, to show whether the player is signed in */
  sync?: SyncApi;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The first screen: choose how to study. */
export function Home({
  dueCount,
  spacedCount,
  learningCount,
  learningReady,
  puzzleCount,
  onLearning,
  onSpaced,
  onBrowse,
  onSettings,
  sync,
}: Props) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1} accessibilityRole="header">
            Go Flashcards
          </Text>
          <Text style={styles.sub}>How do you want to study?</Text>
        </View>
        <SyncIndicator sync={sync} onPress={onSettings} />
        <Btn label="Settings" kind="ghost" onPress={onSettings} />
      </View>

      <ModeCard
        title="Spaced repetition"
        status={
          dueCount
            ? `${dueCount} due now`
            : spacedCount
              ? `Nothing due right now · ${plural(spacedCount, 'puzzle')}`
              : 'No puzzles yet. Add some at the end of a session.'
        }
        highlight={dueCount > 0}
        onPress={onSpaced}
      />
      <ModeCard
        title="Guided Learning"
        status={
          learningCount
            ? `${plural(learningCount, 'puzzle')} · ${learningReady} ready today`
            : 'No puzzles yet. Add some.'
        }
        onPress={onLearning}
      />
      <ModeCard title="Browse" status={plural(puzzleCount, 'puzzle')} onPress={onBrowse} />
    </ScrollView>
  );
}

function ModeCard({
  title,
  status,
  highlight,
  onPress,
}: {
  title: string;
  status: string;
  highlight?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${status}`}
      style={({ pressed }) => [styles.card, highlight && styles.cardHot, pressed && { opacity: 0.8 }]}
    >
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.status, highlight && { color: '#f5c518' }]}>{status}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  h1: { color: theme.text, fontSize: 28, fontWeight: '800' },
  sub: { color: theme.muted, fontSize: 15, marginTop: 2 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 18,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardHot: { borderColor: '#f5c518' },
  cardTitle: { color: theme.text, fontSize: 22, fontWeight: '800' },
  status: { color: theme.muted, fontSize: 14, marginTop: 4, fontWeight: '600' },
});
