import { StyleSheet, View } from 'react-native';
import type { SkillBar as Bar } from '../../progress/skill';

/** A progress bar for a puzzle's skill: it fills up and moves through red, yellow and green to gold. No numbers. */
export function SkillBar({ bar, height = 6, label = 'Skill' }: { bar: Bar; height?: number; label?: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={[styles.track, { height }]}>
      <View
        style={{
          width: `${bar.fill <= 0 ? 0 : Math.max(4, bar.fill * 100)}%`,
          height,
          backgroundColor: bar.color,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: 4, backgroundColor: '#2c3038', overflow: 'hidden' },
});
