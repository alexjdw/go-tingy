import { useMemo, useReducer, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Problem } from '../../data/samples';
import { type MasteryState, inCategory, isDueNow } from '../../progress/mastery';
import type { Attempt, ProgressMap } from '../../progress/skill';
import { SessionQueue, pickSessionIds } from '../../study/session';
import type { Settings } from '../../storage/settings';
import { ScreenHeader } from '../components/ScreenHeader';
import { Btn, theme } from '../components/theme';
import { Study } from './Study';

interface Props {
  problems: Problem[];
  mastery: MasteryState;
  progress: ProgressMap;
  settings: Settings;
  /** save an attempt (this is what schedules the puzzle's next review) */
  record: (id: string, attempt: Attempt) => Promise<void>;
  /** ids of the puzzles in joseki mode, and a way to change that */
  joseki: string[];
  onJosekiChange: (id: string, on: boolean) => void;
  onAddPuzzles: () => void;
  onPrune: () => void;
  onDone: () => void;
}

/**
 * A spaced-repetition session. It starts as soon as the screen opens: the due puzzles one after another, a missed
 * one coming back once at the end. When it's over, the end screen offers Add puzzles and Prune puzzles.
 */
export function SessionScreen({
  problems,
  mastery,
  progress,
  settings,
  record,
  joseki,
  onJosekiChange,
  onAddPuzzles,
  onPrune,
  onDone,
}: Props) {
  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);
  const dueIds = () => problems.filter((p) => isDueNow(mastery, p.id, progress[p.id])).map((p) => p.id);
  const [queue, setQueue] = useState(() => new SessionQueue(pickSessionIds(dueIds())));
  const [batch, setBatch] = useState(0);
  const [, force] = useReducer((n: number) => n + 1, 0);

  const current = queue.current;
  const problem = current ? byId.get(current) : undefined;

  if (current && problem) {
    return (
      <Study
        key={`${batch}-${queue.position}-${problem.id}`}
        problem={problem}
        mode="unguided"
        settings={settings}
        joseki={joseki.includes(problem.id)}
        onJosekiChange={(on) => onJosekiChange(problem.id, on)}
        session={{ position: queue.position, total: queue.total, isLast: queue.position === queue.total }}
        onResult={(a) => {
          queue.complete(a.correct);
          force();
          return record(problem.id, a);
        }}
        onNext={() => {
          queue.next();
          force();
        }}
        onSkip={() => {
          queue.skip();
          queue.next();
          force();
        }}
        onExit={() => {
          queue.finish();
          force();
        }}
      />
    );
  }

  const stats = queue.stats();
  const dueNow = dueIds().length;
  const spacedCount = problems.filter((p) => inCategory(mastery, 'spaced', p.id)).length;
  const nothing = queue.results.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <ScreenHeader
        title={nothing ? (dueNow > 0 ? 'Session ended' : 'Nothing due right now') : 'Session complete'}
        subtitle={
          nothing
            ? dueNow > 0
              ? `${dueNow} still due.`
              : spacedCount
                ? 'Come back later, or change what is in spaced repetition.'
                : 'Add puzzles to spaced repetition to start reviewing.'
            : undefined
        }
      />
      {nothing ? null : (
        <View style={styles.card}>
          <Text style={styles.big}>
            {stats.reviewed} reviewed · {stats.firstTry} right first time
          </Text>
          {stats.missed ? (
            <Text style={styles.text}>
              {stats.missed} to practise again
              {stats.retriesCleared ? `, ${stats.retriesCleared} fixed on the second try` : ''}.
            </Text>
          ) : (
            <Text style={styles.text}>Clean sweep.</Text>
          )}
          {stats.skipped ? <Text style={styles.text}>{stats.skipped} skipped.</Text> : null}
        </View>
      )}
      <View style={styles.actions}>
        {dueNow > 0 ? (
          <Btn
            label={`Review ${Math.min(dueNow, 20)} more`}
            onPress={() => {
              setQueue(new SessionQueue(pickSessionIds(dueIds())));
              setBatch((b) => b + 1);
            }}
          />
        ) : null}
        <Btn label="Add puzzles" kind={dueNow > 0 ? 'ghost' : 'solid'} onPress={onAddPuzzles} />
        <Btn label="Prune puzzles" kind="ghost" disabled={spacedCount === 0} onPress={onPrune} />
        <Btn label="Done" kind="ghost" onPress={onDone} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: { backgroundColor: theme.card, borderRadius: 12, padding: 16, gap: 6 },
  big: { color: theme.text, fontSize: 18, fontWeight: '700' },
  text: { color: theme.text, fontSize: 15 },
  actions: { gap: 10 },
});
