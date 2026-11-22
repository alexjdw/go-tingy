import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A horizontally scrolling row of buttons.
 *
 * A bare horizontal ScrollView has `flex-shrink: 1` on the web, so when a long list below it claims the
 * available height, the browser squashes the row to a sliver and the buttons end up clipped and covered. This
 * row refuses to shrink or grow: it is always exactly as tall as its buttons.
 */
export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.row, style]}
      contentContainerStyle={styles.content}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0, flexShrink: 0 },
  content: { gap: 8 },
});
