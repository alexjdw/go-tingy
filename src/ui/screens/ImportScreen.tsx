import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { Problem } from '../../data/samples';
import {
  addToBatch,
  normalize,
  readPickedFile,
  readPickedFolder,
  selectValid,
  summarize,
  toProblems,
  toggleEntry,
} from '../../sgf/importer';
import type { BatchItem, Entry } from '../../sgf/importer';
import { suggestName } from '../../sgf/folders';
import { LEVEL_COLORS } from '../../progress/skill';
import { Btn, theme } from '../components/theme';

interface Props {
  /** SGF texts already in the library, to flag duplicates. */
  existing: string[];
  onCancel: () => void;
  onImport: (items: Problem[]) => void;
  /** Names of the collections that exist, to warn when an import adds to one. */
  collectionNames?: string[];
}

/** On the web: let the player pick a folder (the browser lists every file in it). Null when nothing was picked. */
function pickFolderFiles(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.onchange = () => resolve(input.files?.length ? [...input.files] : null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export function ImportScreen({ existing, onCancel, onImport, collectionNames = [] }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [paste, setPaste] = useState('');
  const [notice, setNotice] = useState('');
  const [naming, setNaming] = useState<string | null>(null);
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

  const pickFolder = async () => {
    setNotice('');
    try {
      const picked = await pickFolderFiles();
      if (!picked) return;
      const files = await Promise.all(
        picked.map(async (f) => ({
          path: f.webkitRelativePath || f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      const batch = readPickedFolder(files);
      if (!batch.length) setNotice('No .sgf, .gz or .zip files in that folder');
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
  // Two or more puzzles at once (a folder, an archive, a file of several puzzles) are asked a collection name first.
  const doImport = () =>
    selectedCount > 1 ? setNaming(suggestName(entries.filter((e) => e.include))) : onImport(toProblems(entries));
  const finishNaming = (name: string | null) => {
    setNaming(null);
    onImport(toProblems(entries, Date.now(), name));
  };

  const header = (
    <View style={{ gap: 10, marginBottom: 12 }}>
      <Text style={styles.h1}>Import SGF</Text>
      <Text style={styles.hint}>
        Pick .sgf, .sgf.gz or .zip files{Platform.OS === 'web' ? ', or a whole folder' : ''}. A file can hold a whole
        collection of puzzles; each one is split out and validated before import. When you import several puzzles you
        choose a name for their collection.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn label="Choose files…" onPress={pickFiles} />
        {Platform.OS === 'web' ? <Btn label="Choose folder…" kind="ghost" onPress={pickFolder} /> : null}
      </View>
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
                  {!bad && e.v.dims ? ` · ${e.v.dims.cols}×${e.v.dims.rows} · ${e.v.moves} moves` : ''}
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
      {naming !== null ? (
        <View style={styles.naming}>
          <Text style={styles.title}>Name this collection</Text>
          <Text style={styles.hint}>
            {selectedCount} puzzles will go into one collection
            {entries.some((e) => e.folder) ? ', keeping their folders' : ''}.
            {collectionNames.includes(naming.trim())
              ? ' A collection with this name exists: they are added to it.'
              : ''}
          </Text>
          <TextInput
            value={naming}
            onChangeText={setNaming}
            autoFocus
            accessibilityLabel="Collection name"
            placeholder="Collection name"
            placeholderTextColor={theme.muted}
            style={styles.input}
          />
          <View style={styles.footer}>
            <Btn label="Back" kind="ghost" onPress={() => setNaming(null)} />
            <Btn label="No collection" kind="ghost" onPress={() => finishNaming(null)} />
            <Btn label={`Import ${selectedCount}`} disabled={!naming.trim()} onPress={() => finishNaming(naming)} />
          </View>
        </View>
      ) : (
        <View style={styles.footer}>
          <Btn label="Cancel" kind="ghost" onPress={onCancel} />
          <Btn label="Select valid" kind="ghost" disabled={!entries.length} onPress={() => setEntries(selectValid)} />
          <Btn label={`Import ${selectedCount}`} onPress={doImport} disabled={!selectedCount} />
        </View>
      )}
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
  naming: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.card },
  footer: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', paddingTop: 10 },
});
