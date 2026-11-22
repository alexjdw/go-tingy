import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Problem } from '../../data/samples';
import type { Mode } from '../../study/engine';
import { type Attempt, LEVEL_COLORS, computeSkill, isDue } from '../../progress/skill';
import { Btn, theme } from '../components/theme';

interface Props {
  problems: Problem[];
  progress: Record<string, Attempt[]>;
  onStart: (p: Problem, mode: Mode) => void;
  onImport: () => void;
  onDelete: (p: Problem) => void;
  onDeleteMany: (ids: string[]) => void;
  onNew: () => void;
  onEdit: (p: Problem) => void;
  onSettings: () => void;
}

export function Library({ problems, progress, onStart, onImport, onDelete, onDeleteMany, onNew, onEdit, onSettings }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [coll, setColl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const collections = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) if (p.collection) m.set(p.collection, (m.get(p.collection) ?? 0) + 1);
    return [...m.entries()];
  }, [problems]);
  const activeColl = coll && collections.some(([c]) => c === coll) ? coll : null;
  const inColl = activeColl ? problems.filter((p) => p.collection === activeColl) : problems;
  const shown = dueOnly ? inColl.filter((p) => isDue(progress[p.id])) : inColl;

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={styles.h1}>Go Flashcards</Text>
        <Btn label="Settings" kind="ghost" onPress={onSettings} />
      </View>
      <View style={styles.toolbar}>
        <Btn label="New puzzle" onPress={onNew} />
        <Btn label="+ SGF" kind="ghost" onPress={onImport} />
        <Btn label={dueOnly ? 'Show all' : 'Due only'} kind="ghost" onPress={() => setDueOnly((v) => !v)} />
      </View>
      {collections.length ? (
        <View style={{ marginBottom: 12, gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Btn label="All" kind={activeColl ? 'ghost' : 'solid'} onPress={() => { setColl(null); setConfirm(false); }} />
            {collections.map(([c, n]) => (
              <Btn key={c} label={`${c} (${n})`} kind={activeColl === c ? 'solid' : 'ghost'} onPress={() => { setColl(c); setConfirm(false); }} />
            ))}
          </ScrollView>
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
        ListEmptyComponent={<Text style={styles.empty}>Nothing due. Nice work!</Text>}
        renderItem={({ item }) => {
          const skill = computeSkill(progress[item.id]);
          const expanded = open === item.id;
          return (
            <Pressable style={styles.card} onPress={() => setOpen(expanded ? null : item.id)}>
              <View style={styles.cardRow}>
                <View style={[styles.dot, { backgroundColor: LEVEL_COLORS[skill.level] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.sub}>
                    {item.collection && !activeColl ? `${item.collection} · ` : ''}{skill.level}
                    {skill.attempts ? ` · ${Math.round(skill.accuracy * 100)}% accurate (${skill.attempts})` : ''}
                  </Text>
                </View>
              </View>
              {expanded ? (
                <View style={styles.actions}>
                  <Btn label="Guided" onPress={() => onStart(item, 'guided')} />
                  <Btn label="Unguided" onPress={() => onStart(item, 'unguided')} />
                  <Btn label="Explore" onPress={() => onStart(item, 'explore')} />
                  {!item.builtin ? <Btn label="Edit" kind="ghost" onPress={() => onEdit(item)} /> : null}
                  {!item.builtin ? <Btn label="Delete" kind="ghost" onPress={() => onDelete(item)} /> : null}
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
  card: { backgroundColor: theme.card, borderRadius: 10, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  title: { color: theme.text, fontSize: 16, fontWeight: '600' },
  sub: { color: theme.muted, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40 },
});
