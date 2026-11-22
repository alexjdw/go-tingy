import { memo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StatSection } from '../../progress/stats';
import type { Problem } from '../../data/samples';
import { cachedPreview } from '../../go/thumbnail';
import type { SkillBar as SkillBarData } from '../../progress/skill';
import { BoardView } from './Board';
import { SkillBar } from './SkillBar';
import { StatsHover, StatsSheet } from './TileStats';
import { Btn, theme } from './theme';

export interface TileAction {
  label: string;
  onPress: () => void;
  kind?: 'solid' | 'ghost';
  disabled?: boolean;
  accessibilityLabel?: string;
  /** a narrow button that doesn't stretch (like the "+") */
  compact?: boolean;
}

interface Props {
  problem: Problem;
  /** the tile's width in points */
  width: number;
  /** a mastery puzzle's progress, drawn as a bar under the picture */
  bar?: SkillBarData;
  /** a small badge in the picture's top-left corner (the mastery level) */
  badge?: ReactNode;
  /** a short line under the title */
  caption?: string;
  tags?: string[];
  /** The puzzle's stats in every mode, built only when they are shown (on hover or long press). */
  stats?: () => StatSection[];
  actions: TileAction[];
}

const PAD = 8;
const noop = () => {};

/** The starting position in a 7x7 window. Memoized: it only redraws if the puzzle or the size changes. */
const Thumb = memo(function Thumb({ sgf, width }: { sgf: string; width: number }) {
  const p = cachedPreview(sgf);
  return (
    <BoardView
      board={p.board}
      view={p.view}
      width={width}
      last={null}
      hints={[]}
      markup={[]}
      onPlay={noop}
      open={p.open}
      disabled
    />
  );
});

/** A puzzle as a tile: a picture of its starting position, its name, and the buttons for what you can do with it. */
export function PuzzleTile({ problem, width, bar, badge, caption, tags, stats, actions }: Props) {
  const [hover, setHover] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <Pressable
      accessible={false}
      style={[styles.tile, { width }]}
      onLongPress={stats ? () => setSheet(true) : undefined}
      delayLongPress={350}
      onHoverIn={stats ? () => setHover(true) : undefined}
      onHoverOut={stats ? () => setHover(false) : undefined}
    >
      <View style={styles.thumb}>
        <Thumb sgf={problem.sgf} width={width - PAD * 2} />
        {badge ? <View style={styles.badge}>{badge}</View> : null}
      </View>
      {bar ? <SkillBar bar={bar} /> : null}
      <Text style={styles.title} numberOfLines={1}>
        {problem.title}
      </Text>
      {caption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
      {tags?.length ? (
        <Text style={styles.tags} numberOfLines={1}>
          {tags.join(' · ')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {actions.map((a) => (
          <View key={a.label} style={a.compact ? undefined : styles.grow}>
            <Btn
              label={a.label}
              kind={a.kind}
              disabled={a.disabled}
              accessibilityLabel={a.accessibilityLabel ?? `${a.label} ${problem.title}`}
              onPress={a.onPress}
            />
          </View>
        ))}
      </View>
      {hover && stats ? <StatsHover sections={stats()} /> : null}
      {sheet && stats ? <StatsSheet title={problem.title} sections={stats()} onClose={() => setSheet(false)} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: theme.card, borderRadius: 12, padding: PAD, gap: 6 },
  thumb: { borderRadius: 6, overflow: 'hidden' },
  badge: { position: 'absolute', top: 6, left: 6 },
  title: { color: theme.text, fontSize: 14, fontWeight: '700' },
  caption: { color: theme.muted, fontSize: 12 },
  tags: { color: theme.muted, fontSize: 11 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 2 },
  grow: { flex: 1 },
});
