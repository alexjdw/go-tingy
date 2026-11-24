import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { Problem } from '../../data/samples';
import { childFolders, collectionsOf, inFolder } from '../../sgf/folders';
import { ChipRow } from './ChipRow';
import { Btn, theme } from './theme';

export { collectionsOf };

/**
 * A hook for the collection filter: which collection (and folder inside it) is selected, and the puzzles that match.
 * A selection that no longer exists (the collection was deleted or renamed) falls back to "all".
 */
export function useCollectionFilter(problems: Problem[]) {
  const [selected, setSelected] = useState<string | null>(null);
  const [folderPath, setFolder] = useState<string | null>(null);
  const collections = useMemo(() => collectionsOf(problems), [problems]);
  const active = selected && collections.some(([c]) => c === selected) ? selected : null;
  const folder =
    active && folderPath && problems.some((p) => p.collection === active && inFolder(p, folderPath))
      ? folderPath
      : null;
  const folders = useMemo(() => (active ? childFolders(problems, active, folder) : []), [problems, active, folder]);
  const shown = useMemo(
    () => (active ? problems.filter((p) => p.collection === active && inFolder(p, folder)) : problems),
    [problems, active, folder],
  );
  const select = (c: string | null) => {
    setSelected(c);
    setFolder(null);
  };
  return { collections, active, setSelected: select, folders, folder, setFolder, shown };
}

interface Props {
  collections: [string, number][];
  active: string | null;
  onSelect: (collection: string | null) => void;
  /** the folders one level below the selected folder, and the selected folder (a path) */
  folders?: [string, number][];
  folder?: string | null;
  onFolder?: (folder: string | null) => void;
  /** shown for a selected collection: delete all its puzzles (asks twice) */
  onDeleteCollection?: (collection: string) => void;
  deleteCount?: number;
  /** shown for a selected collection: give it another name */
  onRenameCollection?: (collection: string, name: string) => void;
}

/** Chips to pick a collection, and the folders inside it. Renders nothing when there are no collections. */
export function CollectionBar({
  collections,
  active,
  onSelect,
  folders = [],
  folder = null,
  onFolder,
  onDeleteCollection,
  deleteCount = 0,
  onRenameCollection,
}: Props) {
  const [confirm, setConfirm] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!collections.length) return null;
  const up = folder ? (folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : null) : null;
  return (
    <View style={{ gap: 8 }}>
      <ChipRow>
        <Btn
          label="All puzzles"
          kind={active ? 'ghost' : 'solid'}
          onPress={() => {
            onSelect(null);
            setConfirm(false);
            setRenaming(null);
          }}
        />
        {collections.map(([c, n]) => (
          <Btn
            key={c}
            label={`${c} (${n})`}
            kind={active === c ? 'solid' : 'ghost'}
            onPress={() => {
              onSelect(c);
              setConfirm(false);
              setRenaming(null);
            }}
          />
        ))}
      </ChipRow>
      {active && onFolder && (folder || folders.length) ? (
        <ChipRow>
          {folder ? (
            <Btn
              label={`‹ ${up ?? active}`}
              kind="ghost"
              accessibilityLabel="Up one folder"
              onPress={() => onFolder(up)}
            />
          ) : null}
          {folders.map(([f, n]) => (
            <Btn key={f} label={`${f} (${n})`} kind="ghost" onPress={() => onFolder(folder ? `${folder}/${f}` : f)} />
          ))}
        </ChipRow>
      ) : null}
      {active && renaming !== null ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={renaming}
            onChangeText={setRenaming}
            autoFocus
            accessibilityLabel="Collection name"
            placeholder="Collection name"
            placeholderTextColor={theme.muted}
            style={{
              flex: 1,
              backgroundColor: theme.card,
              color: theme.text,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 14,
            }}
          />
          <Btn
            label="Save name"
            disabled={!renaming.trim()}
            onPress={() => {
              onRenameCollection?.(active, renaming);
              setRenaming(null);
              onSelect(renaming.trim());
            }}
          />
          <Btn label="Cancel" kind="ghost" onPress={() => setRenaming(null)} />
        </View>
      ) : active && (onDeleteCollection || onRenameCollection) ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {onRenameCollection ? (
            <Btn label="Rename collection" kind="ghost" onPress={() => setRenaming(active)} />
          ) : null}
          {onDeleteCollection ? (
            <Btn
              label={confirm ? `Tap again to delete ${deleteCount} puzzles` : 'Delete collection'}
              kind="ghost"
              onPress={() => {
                if (!confirm) return setConfirm(true);
                onDeleteCollection(active);
                setConfirm(false);
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
