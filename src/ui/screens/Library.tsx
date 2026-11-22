import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Problem } from '../../data/samples';
import {
  DAILY_LIMIT,
  type Category,
  type LibraryFilter,
  type MasteryState,
  attemptsLeft,
  guidedStages,
  guidedStatus,
  inCategory,
  isDueNow,
  localDay,
  masteryUnlocked,
  visibleIds,
} from '../../progress/mastery';
import { type Attempt, LEVEL_COLORS, computeSkill } from '../../progress/skill';
import type { Mode } from '../../study/engine';
import { learnerDepth } from '../../study/lines';
import { ChipRow } from '../components/ChipRow';
import { Btn, MASTERY_COLORS, theme } from '../components/theme';

export type RunKind = 'guided' | 'mastery';

interface Props {
  problems: Problem[];
  progress: Record<string, Attempt[]>;
  mastery: MasteryState;
  onStart: (p: Problem, mode: Mode) => void;
  onStartRun: (p: Problem, kind: RunKind) => void;
  onToggleCategory: (id: string, cat: Category, on: boolean) => void;
  onImport: () => void;
  onDelete: (p: Problem) => void;
  onDeleteMany: (ids: string[]) => void;
  onNew: () => void;
  onEdit: (p: Problem) => void;
  onSettings: () => void;
}

const FILTERS: { key: LibraryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'due', label: 'Due' },
  { key: 'spaced', label: 'Spaced repetition' },
  { key: 'mastery', label: 'Guided mastery' },
];

export function Library({
  problems,
  progress,
  mastery,
  onStart,
  onStartRun,
  onToggleCategory,
  onImport,
  onDelete,
  onDeleteMany,
  onNew,
  onEdit,
  onSettings,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [coll, setColl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const depthCache = useRef(new Map<string, number>());
  const depthOf = (p: Problem) => {
    let d = depthCache.current.get(p.sgf);
    if (d === undefined) {
      try {
        d = learnerDepth(p.sgf);
      } catch {
        d = 0;
      }
      depthCache.current.set(p.sgf, d);
    }
    return d;
  };

  const collections = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) if (p.collection) m.set(p.collection, (m.get(p.collection) ?? 0) + 1);
    return [...m.entries()];
  }, [problems]);
  const activeColl = coll && collections.some(([c]) => c === coll) ? coll : null;
  const inColl = activeColl ? problems.filter((p) => p.collection === activeColl) : problems;
  const shown = useMemo(() => {
    const keep = new Set(
      visibleIds(
        inColl.map((p) => p.id),
        filter,
        mastery,
        progress,
      ),
    );
    return inColl.filter((p) => keep.has(p.id));
  }, [inColl, filter, mastery, progress]);
  const dueCount = useMemo(
    () => problems.filter((p) => isDueNow(mastery, p.id, progress[p.id])).length,
    [problems, mastery, progress],
  );
  const day = localDay(new Date());

  const emptyText =
    filter === 'due'
      ? 'Nothing due. Add puzzles to spaced repetition to have them come due.'
      : filter === 'spaced'
        ? 'No puzzles in spaced repetition yet. Open a puzzle and add it.'
        : filter === 'mastery'
          ? 'No puzzles in guided mastery yet. Open a puzzle and add it.'
          : 'No puzzles.';

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={styles.h1}>Go Flashcards</Text>
        <Btn label="Settings" kind="ghost" onPress={onSettings} />
      </View>
      <View style={styles.toolbar}>
        <Btn label="New puzzle" onPress={onNew} />
        <Btn label="+ SGF" kind="ghost" onPress={onImport} />
      </View>
      <ChipRow style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <Btn
            key={f.key}
            label={f.key === 'due' ? `Due (${dueCount})` : f.label}
            kind={filter === f.key ? 'solid' : 'ghost'}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ChipRow>
      {collections.length ? (
        <View style={{ marginBottom: 12, gap: 8 }}>
          <ChipRow>
            <Btn
              label="All files"
              kind={activeColl ? 'ghost' : 'solid'}
              onPress={() => {
                setColl(null);
                setConfirm(false);
              }}
            />
            {collections.map(([c, n]) => (
              <Btn
                key={c}
                label={`${c} (${n})`}
                kind={activeColl === c ? 'solid' : 'ghost'}
                onPress={() => {
                  setColl(c);
                  setConfirm(false);
                }}
              />
            ))}
          </ChipRow>
          {activeColl ? (
            <View style={{ flexDirection: 'row' }}>
              <Btn
                label={confirm ? `Tap again to delete ${inColl.length} puzzles` : 'Delete collection'}
                kind="ghost"
                onPress={() => {
                  if (!confirm) return setConfirm(true);
                  onDeleteMany(inColl.map((p) => p.id));
                  setColl(null);
                  setConfirm(false);
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
        renderItem={({ item }) => {
          const skill = computeSkill(progress[item.id]);
          const expanded = open === item.id;
          const spaced = inCategory(mastery, 'spaced', item.id);
          const gm = inCategory(mastery, 'mastery', item.id);
          const due = isDueNow(mastery, item.id, progress[item.id]);
          const L = gm ? depthOf(item) : 0;
          const guided = gm ? guidedStatus(mastery, item.id, L) : null;
          const best = mastery.scores[item.id]?.best;
          const left = attemptsLeft(mastery, item.id, day);
          const unlocked = masteryUnlocked(mastery, item.id);
          const stages = guidedStages(L);
          const stage = guided ? Math.max(0, stages.indexOf(guided.free)) + 1 : 0;

          const tags = [
            spaced ? (due ? 'spaced repetition · due' : 'spaced repetition') : '',
            gm ? (guided?.cleared ? 'guided cleared' : `guided: ${guided?.free} free`) : '',
            gm && best ? `mastery ${best.level} ${best.score.toFixed(1)}` : '',
          ].filter(Boolean);

          return (
            <Pressable style={styles.card} onPress={() => setOpen(expanded ? null : item.id)}>
              <View style={styles.cardRow}>
                <View style={[styles.dot, { backgroundColor: LEVEL_COLORS[skill.level] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.sub}>
                    {item.collection && !activeColl ? `${item.collection} · ` : ''}
                    {skill.level}
                    {skill.attempts ? ` · ${Math.round(skill.accuracy * 100)}% accurate (${skill.attempts})` : ''}
                  </Text>
                  {tags.length ? (
                    <Text style={[styles.sub, due && { color: LEVEL_COLORS.yellow }]}>{tags.join(' · ')}</Text>
                  ) : null}
                </View>
              </View>
              {expanded ? (
                <View style={{ gap: 12 }}>
                  <View style={styles.actions}>
                    <Btn label="Guided" onPress={() => onStart(item, 'guided')} />
                    <Btn label="Unguided" onPress={() => onStart(item, 'unguided')} />
                    <Btn label="Explore" onPress={() => onStart(item, 'explore')} />
                    {!item.builtin ? <Btn label="Edit" kind="ghost" onPress={() => onEdit(item)} /> : null}
                    {!item.builtin ? <Btn label="Delete" kind="ghost" onPress={() => onDelete(item)} /> : null}
                  </View>

                  <View style={styles.actions}>
                    <Btn
                      label={spaced ? 'Spaced repetition ✓ (remove)' : 'Add to spaced repetition'}
                      kind={spaced ? 'solid' : 'ghost'}
                      onPress={() => onToggleCategory(item.id, 'spaced', !spaced)}
                    />
                    <Btn
                      label={gm ? 'Guided mastery ✓ (remove)' : 'Add to guided mastery'}
                      kind={gm ? 'solid' : 'ghost'}
                      onPress={() => onToggleCategory(item.id, 'mastery', !gm)}
                    />
                  </View>

                  {gm && guided ? (
                    <View style={styles.panel}>
                      <Text style={styles.panelTitle}>Guided mastery</Text>
                      {L === 0 ? (
                        <Text style={styles.sub}>This puzzle has no solution line, so it cannot be trained here.</Text>
                      ) : guided.cleared ? (
                        <Text style={styles.sub}>Guided stage cleared. Mastery runs are unlocked.</Text>
                      ) : (
                        <Text style={styles.sub}>
                          Stage {stage} of {stages.length}: the next guided run plays {guided.free} move
                          {guided.free === 1 ? '' : 's'} for you.
                          {guided.free === 0 ? ' Get this one right to clear the guided stage.' : ''}
                        </Text>
                      )}
                      {best ? (
                        <Text style={[styles.sub, { color: MASTERY_COLORS[best.level] }]}>
                          Best mastery score {best.score.toFixed(1)} ({best.level})
                        </Text>
                      ) : null}
                      <Text style={styles.sub}>
                        Attempts left today: {left}/{DAILY_LIMIT}
                        {left === 0 ? ' (resets at midnight)' : ''}
                      </Text>
                      <View style={styles.actions}>
                        <Btn
                          label={guided.cleared ? 'Guided run (cleared)' : `Guided run (${guided.free} free)`}
                          disabled={L === 0 || guided.cleared || left === 0}
                          onPress={() => onStartRun(item, 'guided')}
                        />
                        <Btn
                          label="Mastery run"
                          disabled={L === 0 || !unlocked || left === 0}
                          onPress={() => onStartRun(item, 'mastery')}
                        />
                      </View>
                      {!unlocked && L > 0 ? (
                        <Text style={styles.sub}>Mastery runs unlock once the guided stage is cleared.</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  toolbar: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  h1: { color: theme.text, fontSize: 24, fontWeight: '800' },
  card: { backgroundColor: theme.card, borderRadius: 10, padding: 14, gap: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  title: { color: theme.text, fontSize: 16, fontWeight: '600' },
  sub: { color: theme.muted, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  panel: { backgroundColor: theme.bg, borderRadius: 8, padding: 12, gap: 8 },
  panelTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40 },
});
