import { useMemo } from 'react';
import { View } from 'react-native';
import type { Problem } from '../../data/samples';
import { easiestFirst, isEasy } from '../../progress/practice';
import { type ProgressMap, computeSkill } from '../../progress/skill';
import { PuzzleGrid } from '../components/PuzzleGrid';
import { PuzzleTile } from '../components/PuzzleTile';
import { ScreenHeader } from '../components/ScreenHeader';

interface Props {
  /** the puzzles in spaced repetition */
  problems: Problem[];
  progress: ProgressMap;
  onRemove: (p: Problem) => void;
  onBack: () => void;
}

/**
 * "Prune puzzles": the spaced-repetition puzzles, easiest first, each with a Remove button. Removing keeps its
 * scores, so the puzzle can be added back later.
 */
export function Prune({ problems, progress, onRemove, onBack }: Props) {
  const ordered = useMemo(() => {
    const byId = new Map(problems.map((p) => [p.id, p]));
    return easiestFirst(
      problems.map((p) => p.id),
      progress,
    ).map((id) => byId.get(id)!);
  }, [problems, progress]);
  const easy = ordered.filter((p) => isEasy(computeSkill(progress[p.id]).level)).length;

  const header = (
    <View style={{ gap: 12 }}>
      <ScreenHeader
        title="Prune puzzles"
        subtitle={
          easy
            ? `${easy} look easy now (silver or gold). Remove the ones you no longer need to review.`
            : 'Remove puzzles you no longer need to review. The easiest are listed first.'
        }
        onBack={onBack}
      />
    </View>
  );

  return (
    <PuzzleGrid
      data={ordered}
      keyExtractor={(p) => p.id}
      header={header}
      empty="No puzzles in spaced repetition."
      renderTile={(p, width) => {
        const skill = computeSkill(progress[p.id]);
        return (
          <PuzzleTile
            problem={p}
            width={width}
            caption={
              skill.attempts
                ? `${skill.level} · ${Math.round(skill.accuracy * 100)}% accurate (${skill.attempts})`
                : 'not attempted yet'
            }
            tags={isEasy(skill.level) ? ['looks easy'] : []}
            actions={[
              {
                label: 'Remove',
                kind: 'ghost',
                accessibilityLabel: `Remove ${p.title} from spaced repetition`,
                onPress: () => onRemove(p),
              },
            ]}
          />
        );
      }}
    />
  );
}
