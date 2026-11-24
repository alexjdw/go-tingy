import { StyleSheet, Text, View } from 'react-native';
import { SELF_LABEL, SELF_RATINGS, type SelfRating } from '../../progress/skill';
import { Btn, theme } from './theme';

/** Paper mode: after Done, the player says how the puzzle went. */
export function RatingPrompt({ onRate }: { onRate: (r: SelfRating) => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.q}>How did it go?</Text>
      <View style={styles.row}>
        {SELF_RATINGS.map((r) => (
          <Btn key={r} label={SELF_LABEL[r]} kind={r === 'toohard' ? 'ghost' : 'solid'} onPress={() => onRate(r)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  q: { color: theme.text, fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
});
