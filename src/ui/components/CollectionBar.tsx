import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Problem } from '../../data/samples';
import { ChipRow } from './ChipRow';
import { Btn } from './theme';

/** The imported files ("collections") in a list of puzzles, with how many puzzles each holds. */
export function collectionsOf(problems: Problem[]): [string, number][] {
  const m = new Map<string, number>();
  for (const p of problems) if (p.collection) m.set(p.collection, (m.get(p.collection) ?? 0) + 1);
  return [...m.entries()];
}

/**
 * A hook for the collection filter: which collection is selected, and the puzzles that match it. A selection
 * that no longer exists (the collection was deleted) falls back to "all".
 */
export function useCollectionFilter(problems: Problem[]) {
  const [selected, setSelected] = useState<string | null>(null);
  const collections = useMemo(() => collectionsOf(problems), [problems]);
  const active = selected && collections.some(([c]) => c === selected) ? selected : null;
  const shown = useMemo(
    () => (active ? problems.filter((p) => p.collection === active) : problems),
    [problems, active],
  );
  return { collections, active, setSelected, shown };
}

interface Props {
  collections: [string, number][];
  active: string | null;
  onSelect: (collection: string | null) => void;
  /** shown for a selected collection: delete all its puzzles (asks twice) */
  onDeleteCollection?: (collection: string) => void;
  deleteCount?: number;
}

/** Chips to filter by imported file. Renders nothing when there are no collections. */
export function CollectionBar({ collections, active, onSelect, onDeleteCollection, deleteCount = 0 }: Props) {
  const [confirm, setConfirm] = useState(false);
  if (!collections.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <ChipRow>
        <Btn
          label="All files"
          kind={active ? 'ghost' : 'solid'}
          onPress={() => {
            onSelect(null);
            setConfirm(false);
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
            }}
          />
        ))}
      </ChipRow>
      {active && onDeleteCollection ? (
        <View style={{ flexDirection: 'row' }}>
          <Btn
            label={confirm ? `Tap again to delete ${deleteCount} puzzles` : 'Delete collection'}
            kind="ghost"
            onPress={() => {
              if (!confirm) return setConfirm(true);
              onDeleteCollection(active);
              setConfirm(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
