import { StyleSheet, Text, View } from 'react-native';
import { LEVEL_COLORS } from '../../progress/skill';

/**
 * A rubber-stamp checkmark in the top right corner of a board, so "solved" is seen even when the board is too big
 * to leave room for the status text below it. Put it inside the board's box; it never takes taps.
 */
export function SolvedStamp() {
  return (
    <View pointerEvents="none" style={styles.stamp} accessibilityLabel="Solved" accessibilityRole="image">
      <Text style={styles.check}>✓</Text>
    </View>
  );
}

const GREEN = LEVEL_COLORS.green;

const styles = StyleSheet.create({
  stamp: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: GREEN,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.92,
    transform: [{ rotate: '-12deg' }],
  },
  check: { color: GREEN, fontSize: 34, lineHeight: 40, fontWeight: '900', fontFamily: 'Courier New, monospace' },
});
