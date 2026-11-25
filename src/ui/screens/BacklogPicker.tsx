import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Problem } from '../../data/samples';
import { backlogCandidates } from '../../progress/backlog';
import { type LearningState, inCategory, localDay, learningProgress, skillMark } from '../../progress/learning';
import { type ProgressMap, computeSkill } from '../../progress/skill';
import { tileStats } from '../../progress/stats';
import { cachedLearnerDepth } from '../../study/lines';
import { LearningBadge } from '../components/LearningBadge';
import { PuzzleGrid } from '../components/PuzzleGrid';
import { PuzzleTile } from '../components/PuzzleTile';
import { ScreenHeader } from '../components/ScreenHeader';
import { Btn } from '../components/theme';

interface Props {
  problems: Problem[];
  progress: ProgressMap;
  learning: LearningState;
  joseki: string[];
  /** how many puzzles to choose, and for how many days they stay a priority (from Settings) */
  count: number;
  days: number;
  onConfirm: (ids: string[]) => void;
  onBack: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Choose the puzzles to work on first: those in guided learning or spaced repetition, the ones the player knows least
 * first. Tap Select on up to `count` of them, then Confirm.
 */
export function BacklogPicker({ problems, progress, learning, joseki, count, days, onConfirm, onBack }: Props) {
  const [chosen, setChosen] = useState<string[]>([]);
  // ranked once when the screen opens, so that tiles don't jump around while the player chooses
  const ranked = useMemo(() => {
    const byId = new Map(problems.map((p) => [p.id, p]));
    return backlogCandidates(
      problems.map((p) => ({ id: p.id, learnerMoves: cachedLearnerDepth(p.sgf) })),
      learning,
      progress,
    ).map((c) => byId.get(c.id)!);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const full = chosen.length >= count;

  const header = (
    <View style={{ gap: 12 }}>
      <ScreenHeader
        title={`Choose ${plural(count, 'puzzle')}`}
        subtitle={`${chosen.length} of ${count} chosen · priority for ${plural(days, 'day')} · lowest scores first`}
        onBack={onBack}
        right={<Btn label="Confirm" disabled={chosen.length === 0} onPress={() => onConfirm(chosen)} />}
      />
    </View>
  );

  return (
    <PuzzleGrid
      data={ranked}
      keyExtractor={(p) => p.id}
      header={header}
      empty="Nothing to choose from. Add puzzles to guided learning or spaced repetition first, or all of them are already priorities."
      renderTile={(p, width) => {
        const inLearning = inCategory(learning, 'learning', p.id);
        const inSpaced = inCategory(learning, 'spaced', p.id);
        const L = cachedLearnerDepth(p.sgf);
        const picked = chosen.includes(p.id);
        return (
          <PuzzleTile
            problem={p}
            width={width}
            bar={inLearning ? learningProgress(learning, p.id, L) : undefined}
            badge={inLearning ? <LearningBadge mark={skillMark(learning, p.id, L)} /> : undefined}
            caption={[
              inLearning ? 'Guided learning' : '',
              inSpaced ? `Spaced: ${computeSkill(progress[p.id]).level}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            tags={joseki.includes(p.id) ? ['Joseki'] : []}
            stats={() =>
              tileStats({
                id: p.id,
                history: progress[p.id],
                learning,
                learnerMoves: L,
                joseki: joseki.includes(p.id),
                day: localDay(new Date()),
              })
            }
            actions={[
              {
                label: picked ? '✓ Chosen' : 'Choose',
                kind: picked ? 'solid' : 'ghost',
                disabled: !picked && full,
                accessibilityLabel: `${picked ? 'Unchoose' : 'Choose'} ${p.title}`,
                onPress: () => setChosen((c) => (picked ? c.filter((id) => id !== p.id) : [...c, p.id])),
              },
            ]}
          />
        );
      }}
    />
  );
}
