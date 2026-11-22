import { useState } from 'react';
import { View } from 'react-native';
import type { Problem } from '../../data/samples';
import { type Category, type MasteryState, inCategory } from '../../progress/mastery';
import { LEVEL_COLORS, type ProgressMap, computeSkill } from '../../progress/skill';
import { CollectionBar, useCollectionFilter } from '../components/CollectionBar';
import { PlusMenu } from '../components/PlusMenu';
import { PuzzleGrid } from '../components/PuzzleGrid';
import { PuzzleTile } from '../components/PuzzleTile';
import { ScreenHeader } from '../components/ScreenHeader';
import { Btn } from '../components/theme';

interface Props {
  problems: Problem[];
  progress: ProgressMap;
  mastery: MasteryState;
  onBack: () => void;
  onPlay: (p: Problem) => void;
  onToggleCategory: (id: string, category: Category, on: boolean) => void;
  onNew: () => void;
  onImport: () => void;
  onEdit: (p: Problem) => void;
  onDelete: (p: Problem) => void;
  onDeleteMany: (ids: string[]) => void;
}

/** Every puzzle as a tile, with Play and "+" under each. New and Import live here too. */
export function Browse({
  problems,
  progress,
  mastery,
  onBack,
  onPlay,
  onToggleCategory,
  onNew,
  onImport,
  onEdit,
  onDelete,
  onDeleteMany,
}: Props) {
  const { collections, active, setSelected, shown } = useCollectionFilter(problems);
  const [menu, setMenu] = useState<Problem | null>(null);

  const header = (
    <View style={{ gap: 12 }}>
      <ScreenHeader title="Browse" subtitle={`${problems.length} puzzles`} onBack={onBack} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn label="New puzzle" onPress={onNew} />
        <Btn label="+ SGF" kind="ghost" accessibilityLabel="Import SGF files" onPress={onImport} />
      </View>
      <CollectionBar
        collections={collections}
        active={active}
        onSelect={setSelected}
        deleteCount={shown.length}
        onDeleteCollection={(c) => onDeleteMany(problems.filter((p) => p.collection === c).map((p) => p.id))}
      />
    </View>
  );

  return (
    <>
      <PuzzleGrid
        key={active ?? 'all'}
        data={shown}
        keyExtractor={(p) => p.id}
        header={header}
        empty="No puzzles here. Create one, or import SGF files."
        renderTile={(p, width) => {
          const spaced = inCategory(mastery, 'spaced', p.id);
          const inMastery = inCategory(mastery, 'mastery', p.id);
          const skill = computeSkill(progress[p.id]);
          return (
            <PuzzleTile
              problem={p}
              width={width}
              dot={skill.level === 'new' ? undefined : LEVEL_COLORS[skill.level]}
              caption={p.collection}
              tags={[spaced ? 'Spaced repetition' : '', inMastery ? 'Mastery' : ''].filter(Boolean)}
              actions={[
                { label: 'Play', onPress: () => onPlay(p) },
                {
                  label: '+',
                  kind: 'ghost',
                  compact: true,
                  accessibilityLabel: `Add ${p.title} to a study mode`,
                  onPress: () => setMenu(p),
                },
              ]}
            />
          );
        }}
      />
      <PlusMenu
        title={menu?.title ?? null}
        spaced={menu ? inCategory(mastery, 'spaced', menu.id) : false}
        mastery={menu ? inCategory(mastery, 'mastery', menu.id) : false}
        onToggle={(category, on) => menu && onToggleCategory(menu.id, category, on)}
        onEdit={
          menu && !menu.builtin
            ? () => {
                const p = menu;
                setMenu(null);
                onEdit(p);
              }
            : undefined
        }
        onDelete={
          menu && !menu.builtin
            ? () => {
                const p = menu;
                setMenu(null);
                onDelete(p);
              }
            : undefined
        }
        onClose={() => setMenu(null)}
      />
    </>
  );
}
