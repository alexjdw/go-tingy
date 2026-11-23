import type { Problem } from '../../data/samples';
import { type Category, type LearningState, inCategory } from '../../progress/learning';
import { CollectionBar, useCollectionFilter } from '../components/CollectionBar';
import { PuzzleGrid } from '../components/PuzzleGrid';
import { PuzzleTile } from '../components/PuzzleTile';
import { ScreenHeader } from '../components/ScreenHeader';
import { View } from 'react-native';

const NAMES: Record<Category, string> = { learning: 'Guided learning', spaced: 'Spaced repetition' };

interface Props {
  category: Category;
  problems: Problem[];
  learning: LearningState;
  onToggle: (id: string, on: boolean) => void;
  onBack: () => void;
}

/** "Add puzzles": the library as tiles, each with one button that adds it to (or takes it out of) a study mode. */
export function Picker({ category, problems, learning, onToggle, onBack }: Props) {
  const { collections, active, setSelected, shown } = useCollectionFilter(problems);
  const added = problems.filter((p) => inCategory(learning, category, p.id)).length;

  const header = (
    <View style={{ gap: 12 }}>
      <ScreenHeader title="Add puzzles" subtitle={`to ${NAMES[category]} · ${added} added so far`} onBack={onBack} />
      <CollectionBar collections={collections} active={active} onSelect={setSelected} />
    </View>
  );

  return (
    <PuzzleGrid
      key={active ?? 'all'}
      data={shown}
      keyExtractor={(p) => p.id}
      header={header}
      empty="No puzzles in the library yet. Create or import some from Browse."
      renderTile={(p, width) => {
        const on = inCategory(learning, category, p.id);
        return (
          <PuzzleTile
            problem={p}
            width={width}
            caption={p.collection}
            actions={[
              {
                label: on ? '✓ Added' : 'Add',
                kind: on ? 'solid' : 'ghost',
                accessibilityLabel: `${on ? 'Remove' : 'Add'} ${p.title} ${on ? 'from' : 'to'} ${NAMES[category]}`,
                onPress: () => onToggle(p.id, !on),
              },
            ]}
          />
        );
      }}
    />
  );
}
