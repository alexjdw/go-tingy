import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Problem } from '../../data/samples';
import {
  type Category,
  type MasteryState,
  inCategory,
  localDay,
  masteryProgress,
  puzzleMasteryLevel,
} from '../../progress/mastery';
import { type RunKind, masteryAction } from '../../progress/practice';
import { cachedLearnerDepth } from '../../study/lines';
import type { ProgressMap } from '../../progress/skill';
import { tileStats } from '../../progress/stats';
import { MasteryBadge } from '../components/MasteryBadge';
import { PlusMenu } from '../components/PlusMenu';
import { PuzzleGrid } from '../components/PuzzleGrid';
import { PuzzleTile } from '../components/PuzzleTile';
import { ScreenHeader } from '../components/ScreenHeader';
import { Btn } from '../components/theme';

interface Props {
  problems: Problem[];
  progress: ProgressMap;
  mastery: MasteryState;
  /** ids of the puzzles in joseki mode */
  joseki: string[];
  onJosekiChange: (id: string, on: boolean) => void;
  onBack: () => void;
  onAddPuzzles: () => void;
  onPlay: (p: Problem, kind: RunKind) => void;
  onToggleCategory: (id: string, category: Category, on: boolean) => void;
}

/**
 * The puzzles in mastery, as tiles like Browse. Play does the puzzle's next training step (a guided run until the
 * guided stage is cleared, then a mastery run); "Add puzzles" is at the top.
 */
export function MasteryHome({
  problems,
  progress,
  mastery,
  joseki,
  onJosekiChange,
  onBack,
  onAddPuzzles,
  onPlay,
  onToggleCategory,
}: Props) {
  const [menu, setMenu] = useState<Problem | null>(null);
  const day = localDay(new Date());
  const members = useMemo(() => problems.filter((p) => inCategory(mastery, 'mastery', p.id)), [problems, mastery]);
  const actions = useMemo(
    () => new Map(members.map((p) => [p.id, masteryAction(mastery, p.id, cachedLearnerDepth(p.sgf), day)])),
    [members, mastery, day],
  );
  const ready = members.filter((p) => actions.get(p.id)?.enabled).length;

  const header = (
    <View style={{ gap: 12 }}>
      <ScreenHeader
        title="Guided Learning"
        subtitle={`${members.length} puzzle${members.length === 1 ? '' : 's'} · ${ready} ready today`}
        onBack={onBack}
        right={<Btn label="Add puzzles" onPress={onAddPuzzles} />}
      />
    </View>
  );

  return (
    <>
      <PuzzleGrid
        data={members}
        keyExtractor={(p) => p.id}
        header={header}
        empty="No puzzles in guided learning yet. Tap Add puzzles to choose some."
        renderTile={(p, width) => {
          const a = actions.get(p.id)!;
          return (
            <PuzzleTile
              problem={p}
              width={width}
              bar={masteryProgress(mastery, p.id, cachedLearnerDepth(p.sgf))}
              badge={<MasteryBadge level={puzzleMasteryLevel(mastery, p.id)} />}
              caption={a.caption}
              tags={joseki.includes(p.id) ? ['Joseki'] : []}
              stats={() =>
                tileStats({
                  id: p.id,
                  history: progress[p.id],
                  mastery,
                  learnerMoves: cachedLearnerDepth(p.sgf),
                  joseki: joseki.includes(p.id),
                  day,
                })
              }
              actions={[
                { label: a.label, disabled: !a.enabled, onPress: () => a.kind && onPlay(p, a.kind) },
                {
                  label: '+',
                  kind: 'ghost',
                  compact: true,
                  accessibilityLabel: `Manage ${p.title}`,
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
        joseki={menu ? joseki.includes(menu.id) : false}
        onJosekiChange={(on) => menu && onJosekiChange(menu.id, on)}
        onToggle={(category, on) => {
          if (!menu) return;
          onToggleCategory(menu.id, category, on);
          if (category === 'mastery' && !on) setMenu(null); // it just left this list
        }}
        onClose={() => setMenu(null)}
      />
    </>
  );
}
