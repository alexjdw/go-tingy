import { Pressable, StyleSheet, Text } from 'react-native';

export const theme = {
  bg: '#14161a',
  card: '#1f2228',
  text: '#f2f3f5',
  muted: '#9aa0aa',
  accent: '#4c8dff',
};

export function Btn({
  label,
  onPress,
  kind = 'solid',
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: 'solid' | 'ghost';
  disabled?: boolean;
  /** what a screen reader says, when the visible label (like "+") isn't enough */
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btn,
        kind === 'ghost' && styles.ghost,
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: theme.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44, // a comfortable touch target
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.muted },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});

/** Colors for the mastery levels (guided mastery runs). */
export const MASTERY_COLORS = {
  none: '#8a8f98',
  green: '#30a46c',
  gold: '#e5a50a',
  diamond: '#5ac8fa',
} as const;
