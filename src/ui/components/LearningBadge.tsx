import { StyleSheet, Text, View } from 'react-native';
import { type TimedLevel, levelFill } from '../../progress/learning';
import { TIMED_COLORS, theme } from './theme';

const LEVEL_NAMES: Record<TimedLevel, string> = {
  none: 'not started',
  green: 'green',
  gold: 'gold',
  diamond: 'diamond',
};

/** A small badge for a puzzle in learning: empty at first, filling with the level's color as the level rises. */
export function LearningBadge({ level }: { level: TimedLevel }) {
  const color = TIMED_COLORS[level];
  return (
    <View accessible accessibilityLabel={`Level: ${LEVEL_NAMES[level]}`} style={[styles.box, { borderColor: color }]}>
      <View style={[styles.fill, { height: `${levelFill(level) * 100}%`, backgroundColor: color }]} />
      <Text style={styles.text}></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 30,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#14161aE6',
  },
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  text: {
    position: 'absolute',
    alignSelf: 'center',
    top: 3,
    color: theme.text,
    fontSize: 11,
    fontWeight: '900',
    textShadowColor: '#000',
    textShadowRadius: 2,
  },
});
