import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Problem } from '../../data/samples';
import { isPriority, priorityDaysLeft, priorityFirst } from '../../progress/backlog';
import {
  type Category,
  DAILY_LIMIT,
  type LearningState,
  inCategory,
  localDay,
  learningProgress,
  skillMark,
} from '../../progress/learning';
import { DEFAULT_AUTO_COUNT } from '../../study/auto';
import { type RunKind, learningAction } from '../../progress/practice';
import { cachedLearnerDepth } from '../../study/lines';
import type { ProgressMap } from '../../progress/skill';
import { tileStats } from '../../progress/stats';
import { LearningBadge } from '../components/LearningBadge';
import { NumberField } from '../components/NumberField';
import { PlusMenu } from '../components/PlusMenu';
import { PuzzleGrid } from '../components/PuzzleGrid';
import { PuzzleTile } from '../components/PuzzleTile';
import { ScreenHeader } from '../components/ScreenHeader';
import { Btn, theme } from '../components/theme';

interface Props {
  problems: Problem[];
  progress: ProgressMap;
  learning: LearningState;
  /** ids of the puzzles in joseki mode */
  joseki: string[];
  onJosekiChange: (id: string, on: boolean) => void;
  onBack: () => void;
  onAddPuzzles: () => void;
  onPlay: (p: Problem, kind: RunKind) => void;
  /** auto mode: pick this many puzzles and play them one after another */
  onAuto: (count: number) => void;
  onToggleCategory: (id: string, category: Category, on: boolean) => void;
}

/**
 * The puzzles in learning, as tiles like Browse. Play does the puzzle's next training step (a guided run until the
 * guided stage is cleared, then a timed run); "Add puzzles" is at the top.
 */
export function LearningHome({
  problems,
  progress,
  learning,
  joseki,
  onJosekiChange,
  onBack,
  onAddPuzzles,
  onPlay,
  onAuto,
  onToggleCategory,
}: Props) {
  const [menu, setMenu] = useState<Problem | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoCount, setAutoCount] = useState(DEFAULT_AUTO_COUNT);
  const day = localDay(new Date());
  // priority puzzles (see the backlog setting) are always at the top
  const members = useMemo(
    () =>
      priorityFirst(
        problems.filter((p) => inCategory(learning, 'learning', p.id)),
        learning,
      ),
    [problems, learning],
  );
  const actions = useMemo(
    () => new Map(members.map((p) => [p.id, learningAction(learning, p.id, cachedLearnerDepth(p.sgf), day)])),
    [members, learning, day],
  );
  const ready = members.filter((p) => actions.get(p.id)?.enabled).length;

  const header = (
    <View style={{ gap: 12 }}>
      <ScreenHeader
        title="Guided Learning"
        subtitle={`${members.length} puzzle${members.length === 1 ? '' : 's'} · ${ready} ready today`}
        onBack={onBack}
        right={
          <>
            <Btn
              label="Auto"
              kind={autoOpen ? 'solid' : 'ghost'}
              disabled={members.length === 0}
              onPress={() => setAutoOpen((o) => !o)}
            />
            <Btn label="Add puzzles" onPress={onAddPuzzles} />
          </>
        }
      />
      {autoOpen ? (
        <View style={styles.auto}>
          <Text style={styles.autoText}>
            Auto mode picks puzzles for you, the ones you know least first (never diamond), and moves on to the next
            when the {DAILY_LIMIT} attempts for today on a puzzle are used up.
          </Text>
          <NumberField label="How many puzzles" value={autoCount} min={1} max={100} onChange={setAutoCount} />
          <Btn label="Start auto mode" onPress={() => onAuto(autoCount)} />
        </View>
      ) : null}
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
              bar={learningProgress(learning, p.id, cachedLearnerDepth(p.sgf))}
              badge={<LearningBadge mark={skillMark(learning, p.id, cachedLearnerDepth(p.sgf))} />}
              caption={a.caption}
              tags={[
                isPriority(learning, p.id) ? `Priority · ${priorityDaysLeft(learning, p.id)}d left` : '',
                joseki.includes(p.id) ? 'Joseki' : '',
              ].filter(Boolean)}
              stats={() =>
                tileStats({
                  id: p.id,
                  history: progress[p.id],
                  learning,
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
        spaced={menu ? inCategory(learning, 'spaced', menu.id) : false}
        learning={menu ? inCategory(learning, 'learning', menu.id) : false}
        joseki={menu ? joseki.includes(menu.id) : false}
        onJosekiChange={(on) => menu && onJosekiChange(menu.id, on)}
        onToggle={(category, on) => {
          if (!menu) return;
          onToggleCategory(menu.id, category, on);
          if (category === 'learning' && !on) setMenu(null); // it just left this list
        }}
        onClose={() => setMenu(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  auto: { backgroundColor: theme.card, borderRadius: 12, padding: 14, gap: 10 },
  autoText: { color: theme.muted, fontSize: 13 },
});
