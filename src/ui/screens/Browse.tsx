import { useState } from 'react';
import { View } from 'react-native';
import type { Problem } from '../../data/samples';
import {
  type Category,
  type LearningState,
  inCategory,
  localDay,
  learningProgress,
  skillMark,
} from '../../progress/learning';
import type { ProgressMap } from '../../progress/skill';
import { tileStats } from '../../progress/stats';
import { LearningBadge } from '../components/LearningBadge';
import { cachedLearnerDepth } from '../../study/lines';
import { CollectionBar, useCollectionFilter } from '../components/CollectionBar';
import { BulkMenu } from '../components/BulkMenu';
import { PlusMenu } from '../components/PlusMenu';
import { PuzzleGrid } from '../components/PuzzleGrid';
import { captionOf, inFolder } from '../../sgf/folders';
import { PuzzleTile } from '../components/PuzzleTile';
import { ScreenHeader } from '../components/ScreenHeader';
import { Btn } from '../components/theme';

const NAMES: Record<Category, string> = { learning: 'Guided learning', spaced: 'Spaced repetition' };

interface Props {
  /** set when opened from "Add puzzles": each tile then has an Add button for this study mode */
  addTo?: Category;
  /** add or remove many puzzles at once (a whole collection or folder) */
  onToggleMany: (ids: string[], category: Category, on: boolean) => void;
  problems: Problem[];
  progress: ProgressMap;
  learning: LearningState;
  /** ids of the puzzles in joseki mode */
  joseki: string[];
  onJosekiChange: (id: string, on: boolean) => void;
  onBack: () => void;
  onPlay: (p: Problem) => void;
  onToggleCategory: (id: string, category: Category, on: boolean) => void;
  onNew: () => void;
  onImport: () => void;
  onFromGame: () => void;
  onEdit: (p: Problem) => void;
  onDelete: (p: Problem) => void;
  onDeleteMany: (ids: string[]) => void;
  onRenameCollection: (collection: string, name: string) => void;
}

/**
 * Every puzzle as a tile, with Play and "+" under each. New and Import live here too. Opened from "Add puzzles"
 * (`addTo`), the same screen puts an Add button on each tile instead of Play, and can add a whole collection at once.
 */
export function Browse({
  addTo,
  onToggleMany,
  problems,
  progress,
  learning,
  joseki,
  onJosekiChange,
  onBack,
  onPlay,
  onToggleCategory,
  onNew,
  onImport,
  onFromGame,
  onEdit,
  onDelete,
  onDeleteMany,
  onRenameCollection,
}: Props) {
  const { collections, active, setSelected, folders, folder, setFolder, shown } = useCollectionFilter(problems);
  const [menu, setMenu] = useState<Problem | null>(null);
  /** a collection or folder whose puzzles are added or removed together (long press or double tap on its chip) */
  const [bulk, setBulk] = useState<{ title: string; ids: string[] } | null>(null);
  const added = addTo ? problems.filter((p) => inCategory(learning, addTo, p.id)).length : 0;
  // with a collection (or a folder of it) selected, one button adds or removes everything shown
  const missing = addTo ? shown.filter((p) => !inCategory(learning, addTo, p.id)) : [];
  const scope = folder ? 'this folder' : 'this collection';

  const header = (
    <View style={{ gap: 12 }}>
      <ScreenHeader
        title={addTo ? 'Add puzzles' : 'Browse'}
        subtitle={addTo ? `to ${NAMES[addTo]} · ${added} added so far` : `${problems.length} puzzles`}
        onBack={onBack}
      />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn label="New puzzle" onPress={onNew} />
        <Btn label="New from game" kind="ghost" onPress={onFromGame} />
        <Btn label="+ SGF" kind="ghost" accessibilityLabel="Import SGF files" onPress={onImport} />
      </View>
      <CollectionBar
        collections={collections}
        active={active}
        onSelect={setSelected}
        folders={folders}
        folder={folder}
        onFolder={setFolder}
        onRenameCollection={onRenameCollection}
        onMenu={({ collection, folder: path }) =>
          setBulk({
            title: path ? `${collection} / ${path.split('/').join(' / ')}` : collection,
            ids: problems.filter((p) => p.collection === collection && inFolder(p, path)).map((p) => p.id),
          })
        }
        deleteCount={collections.find(([c]) => c === active)?.[1] ?? 0}
        onDeleteCollection={(c) => onDeleteMany(problems.filter((p) => p.collection === c).map((p) => p.id))}
      />
      {addTo && active && shown.length > 0 && (
        <View style={{ flexDirection: 'row' }}>
          {missing.length > 0 ? (
            <Btn
              label={`Add all ${missing.length} from ${scope}`}
              accessibilityLabel={`Add all puzzles from ${scope} to ${NAMES[addTo]}`}
              onPress={() =>
                onToggleMany(
                  missing.map((p) => p.id),
                  addTo,
                  true,
                )
              }
            />
          ) : (
            <Btn
              kind="ghost"
              label={`✓ All added · Remove all from ${scope}`}
              accessibilityLabel={`Remove all puzzles of ${scope} from ${NAMES[addTo]}`}
              onPress={() =>
                onToggleMany(
                  shown.map((p) => p.id),
                  addTo,
                  false,
                )
              }
            />
          )}
        </View>
      )}
    </View>
  );

  return (
    <>
      <PuzzleGrid
        key={`${active ?? 'all'}/${folder ?? ''}`}
        data={shown}
        keyExtractor={(p) => p.id}
        header={header}
        empty="No puzzles here. Create one, or import SGF files."
        renderTile={(p, width) => {
          const spaced = inCategory(learning, 'spaced', p.id);
          const inLearning = inCategory(learning, 'learning', p.id);
          return (
            <PuzzleTile
              problem={p}
              width={width}
              bar={inLearning ? learningProgress(learning, p.id, cachedLearnerDepth(p.sgf)) : undefined}
              caption={captionOf(p)}
              badge={
                inLearning ? <LearningBadge mark={skillMark(learning, p.id, cachedLearnerDepth(p.sgf))} /> : undefined
              }
              stats={() =>
                tileStats({
                  id: p.id,
                  history: progress[p.id],
                  learning,
                  learnerMoves: cachedLearnerDepth(p.sgf),
                  joseki: joseki.includes(p.id),
                  day: localDay(new Date()),
                })
              }
              tags={[spaced ? 'Spaced repetition' : '', joseki.includes(p.id) ? 'Joseki' : ''].filter(Boolean)}
              actions={[
                addTo
                  ? {
                      label: inCategory(learning, addTo, p.id) ? '✓ Added' : 'Add',
                      kind: inCategory(learning, addTo, p.id) ? 'solid' : 'ghost',
                      accessibilityLabel: `${inCategory(learning, addTo, p.id) ? 'Remove' : 'Add'} ${p.title} ${
                        inCategory(learning, addTo, p.id) ? 'from' : 'to'
                      } ${NAMES[addTo]}`,
                      onPress: () => onToggleCategory(p.id, addTo, !inCategory(learning, addTo, p.id)),
                    }
                  : { label: 'Play', onPress: () => onPlay(p) },
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
      <BulkMenu
        title={bulk?.title ?? null}
        total={bulk?.ids.length ?? 0}
        have={{
          spaced: bulk ? bulk.ids.filter((id) => inCategory(learning, 'spaced', id)).length : 0,
          learning: bulk ? bulk.ids.filter((id) => inCategory(learning, 'learning', id)).length : 0,
        }}
        onToggle={(category, on) => bulk && onToggleMany(bulk.ids, category, on)}
        onClose={() => setBulk(null)}
      />
      <PlusMenu
        title={menu?.title ?? null}
        spaced={menu ? inCategory(learning, 'spaced', menu.id) : false}
        learning={menu ? inCategory(learning, 'learning', menu.id) : false}
        joseki={menu ? joseki.includes(menu.id) : false}
        onJosekiChange={(on) => menu && onJosekiChange(menu.id, on)}
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
