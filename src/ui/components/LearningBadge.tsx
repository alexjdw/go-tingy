import { StyleSheet, Text, View } from 'react-native';
import type { SkillMark } from '../../progress/learning';

const MARKS: Record<SkillMark, { emoji: string; name: string }> = {
  red: { emoji: '🔴', name: 'just starting' },
  yellow: { emoji: '🟡', name: 'getting there' },
  green: { emoji: '🟢', name: 'guided stage cleared' },
  sparkle: { emoji: '✨', name: 'gold' },
  diamond: { emoji: '💎', name: 'diamond' },
};

/** The badge on a puzzle in learning: 🔴 🟡 🟢 ✨ 💎 for its estimated skill level. */
export function LearningBadge({ mark }: { mark: SkillMark }) {
  const m = MARKS[mark];
  return (
    <View accessible accessibilityLabel={`Level: ${m.name}`} style={styles.box}>
      <Text style={styles.text}>{m.emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 3,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14161aCC',
  },
  text: { fontSize: 15, lineHeight: 20 },
});
