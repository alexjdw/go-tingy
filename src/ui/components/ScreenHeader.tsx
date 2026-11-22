import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Btn, theme } from './theme';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** buttons on the right */
  right?: ReactNode;
}

/** The top of a screen: a Back button, the title, and optional buttons on the right. */
export function ScreenHeader({ title, subtitle, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      {onBack ? <Btn label="‹ Back" kind="ghost" onPress={onBack} /> : null}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1 },
  title: { color: theme.text, fontSize: 22, fontWeight: '800' },
  sub: { color: theme.muted, fontSize: 13, marginTop: 2 },
  right: { flexDirection: 'row', gap: 8 },
});
