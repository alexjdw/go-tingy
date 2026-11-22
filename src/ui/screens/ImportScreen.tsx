import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { Problem } from '../../data/samples';
import {
  addToBatch,
  normalize,
  readPickedFile,
  selectValid,
  summarize,
  toProblems,
  toggleEntry,
} from '../../sgf/importer';
import type { BatchItem, Entry } from '../../sgf/importer';
import { LEVEL_COLORS } from '../../progress/skill';
import { Btn, theme } from '../components/theme';

interface Props {
  /** SGF texts already in the library, to flag duplicates. */
  existing: string[];
  onCancel: () => void;
  onImport: (items: Problem[]) => void;
}

export function ImportScreen({ existing, onCancel, onImport }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [paste, setPaste] = useState('');
  const [notice, setNotice] = useState('');
  const existingNorm = useMemo(() => new Set(existing.map(normalize)), [existing]);

  const add = (batch: BatchItem[]) => setEntries((prev) => addToBatch(prev, existingNorm, batch));

  const pickFiles = async () => {
    setNotice('');
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
      if (res.canceled) return;
      const batch: BatchItem[] = [];
      for (const a of res.assets) {
        try {
          const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
          batch.push(...readPickedFile(a.name, bytes)); // unpacks .gz/.zip, decodes text
        } catch (e) {
          setNotice(`Could not read ${a.name}: ${(e as Error).message}`);
        }
      }
      add(batch);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const addPasted = () => {
    add([{ name: 'Pasted puzzle', text: paste }]);
    setPaste('');
  };

  const toggle = (key: string) => setEntries((es) => toggleEntry(es, key));
  const { invalid, duplicates: dups, selected: selectedCount } = summarize(entries);
  const doImport = () => onImport(toProblems(entries));

  const header = (
    <View style={{ gap: 10, marginBottom: 12 }}>
      <Text style={styles.h1}>Import SGF</Text>
      <Text style={styles.hint}>
        Pick .sgf, .sgf.gz or .zip files. A file can hold a whole collection of puzzles; each one is split out and
        validated before import.
      </Text>
      <Btn label="Choose files…" onPress={pickFiles} />
      <TextInput
        value={paste}
        onChangeText={setPaste}
        placeholder="…or paste SGF text here"
        placeholderTextColor={theme.muted}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
      />
      <Btn label="Add pasted text" kind="ghost" onPress={addPasted} disabled={!paste.trim()} />
      {notice ? <Text style={{ color: LEVEL_COLORS.red }}>{notice}</Text> : null}
      {entries.length ? (
        <Text style={styles.hint}>
          {entries.length} found · {invalid} invalid · {dups} duplicate
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
        renderItem={({ item: e }) => {
          const bad = e.v.errors.length > 0;
          const color = bad
            ? LEVEL_COLORS.red
            : e.dup || e.v.warnings.length
              ? LEVEL_COLORS.yellow
              : LEVEL_COLORS.green;
          const lines = [...e.v.errors, ...(e.dup ? ['Already in your library or this batch'] : []), ...e.v.warnings];
          return (
            <Pressable style={styles.card} onPress={() => toggle(e.key)}>
              <View style={[styles.box, { borderColor: color }, e.include && { backgroundColor: color }]}>
                {e.include ? <Text style={styles.tick}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={[styles.sub, { color }]}>
                  {bad ? 'Invalid' : e.dup ? 'Duplicate' : e.v.warnings.length ? 'OK with warnings' : 'Valid'}
                  {!bad && e.v.size ? ` · ${e.v.size}×${e.v.size} · ${e.v.moves} moves` : ''}
                  {e.encoding ? ` · decoded as ${e.encoding}` : ''}
                </Text>
                {lines.slice(0, 3).map((l, i) => (
                  <Text key={i} style={styles.line}>
                    • {l}
                  </Text>
                ))}
              </View>
            </Pressable>
          );
        }}
      />
      <View style={styles.footer}>
        <Btn label="Cancel" kind="ghost" onPress={onCancel} />
        <Btn label="Select valid" kind="ghost" disabled={!entries.length} onPress={() => setEntries(selectValid)} />
        <Btn label={`Import ${selectedCount}`} onPress={doImport} disabled={!selectedCount} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  h1: { color: theme.text, fontSize: 22, fontWeight: '800' },
  hint: { color: theme.muted, fontSize: 13 },
  input: { backgroundColor: theme.card, color: theme.text, borderRadius: 8, padding: 12, fontSize: 14 },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 10,
    padding: 12,
    alignItems: 'flex-start',
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tick: { color: '#111', fontWeight: '900', fontSize: 14 },
  title: { color: theme.text, fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  line: { color: theme.muted, fontSize: 12, marginTop: 2 },
  footer: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', paddingTop: 10 },
});
