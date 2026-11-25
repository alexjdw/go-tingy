import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { clampWhole } from '../../progress/backlog';
import { theme } from './theme';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}

/** A whole number the player types. It can be empty while typing; on leaving the field it snaps into range. */
export function NumberField({ label, value, min, max, onChange }: Props) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(String(value));
  }
  const commit = (t: string) => {
    const n = clampWhole(t, min, max, value);
    setText(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <View style={styles.box}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={(t) => {
          const digits = t.replace(/[^0-9]/g, '').slice(0, 4);
          setText(digits);
          if (digits !== '') {
            const n = clampWhole(digits, min, max, value);
            if (n !== value && String(n) === digits) onChange(n);
          }
        }}
        onBlur={() => commit(text)}
        onSubmitEditing={() => commit(text)}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  label: { color: theme.muted, fontSize: 13 },
  input: {
    color: theme.text,
    backgroundColor: theme.bg,
    borderColor: theme.muted,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 44,
    minWidth: 80,
    paddingHorizontal: 12,
    fontSize: 16,
  },
});
