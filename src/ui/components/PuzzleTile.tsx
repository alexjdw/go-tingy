import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Problem } from '../../data/samples';
import { cachedPreview } from '../../go/thumbnail';
import { BoardView } from './Board';
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
  /** a colored dot, for the puzzle's skill level */
  dot?: string;
  /** a short line under the title */
  caption?: string;
  tags?: string[];
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
export function PuzzleTile({ problem, width, dot, caption, tags, actions }: Props) {
  return (
    <View style={[styles.tile, { width }]}>
      <View style={styles.thumb}>
        <Thumb sgf={problem.sgf} width={width - PAD * 2} />
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: theme.card, borderRadius: 12, padding: PAD, gap: 6 },
  thumb: { borderRadius: 6, overflow: 'hidden' },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#14161a',
  },
  title: { color: theme.text, fontSize: 14, fontWeight: '700' },
  caption: { color: theme.muted, fontSize: 12 },
  tags: { color: theme.muted, fontSize: 11 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 2 },
  grow: { flex: 1 },
});
