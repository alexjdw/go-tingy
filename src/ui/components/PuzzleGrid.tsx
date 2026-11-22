import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BATCH_SIZE, moreLabel, nextCount, remaining, visibleCount } from '../batch';
import { Btn, theme } from './theme';

const GAP = 10;
const MIN_TILE = 150;
const PAGE_MAX = 960;
const PAGE_PAD = 16;

/** How many tile columns fit, and how wide each tile is, for a screen width. */
export function gridLayout(screenWidth: number) {
  const avail = Math.min(screenWidth, PAGE_MAX) - PAGE_PAD * 2;
  const cols = Math.max(2, Math.min(5, Math.floor((avail + GAP) / (MIN_TILE + GAP))));
  return { cols, tileWidth: Math.floor((avail - GAP * (cols - 1)) / cols), gap: GAP };
}

interface Props<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderTile: (item: T, tileWidth: number) => ReactElement;
  /** shown above the tiles; scrolls with them */
  header?: ReactElement;
  /** shown when there are no tiles */
  empty: string;
}

/**
 * Puzzles as a grid of tiles, as many columns as fit, drawn BATCH_SIZE at a time: the next batch loads when you
 * scroll near the end, and a "Show more" button under the last tile does the same. Give the grid a different `key`
 * when the list it shows is replaced (for example a different filter) so that it starts again from the first batch.
 */
export function PuzzleGrid<T>({ data, keyExtractor, renderTile, header, empty }: Props<T>) {
  const { width } = useWindowDimensions();
  const { cols, tileWidth, gap } = gridLayout(width);
  const [shown, setShown] = useState(BATCH_SIZE);
  const total = data.length;
  const visible = useMemo(() => data.slice(0, visibleCount(shown, total)), [data, shown, total]);
  const left = remaining(shown, total);
  const loadMore = useCallback(() => setShown((n) => nextCount(n, total)), [total]);

  return (
    <FlatList
      key={cols} // FlatList needs a new key when the column count changes
      data={visible}
      numColumns={cols}
      keyExtractor={keyExtractor}
      columnWrapperStyle={{ gap }}
      contentContainerStyle={styles.content}
      style={styles.list}
      ListHeaderComponent={header ? <View style={styles.header}>{header}</View> : undefined}
      ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
      ListFooterComponent={
        left > 0 ? (
          <View style={styles.footer}>
            <Text style={styles.count}>
              Showing {visible.length} of {total}
            </Text>
            <Btn label={moreLabel(left)} kind="ghost" onPress={loadMore} />
          </View>
        ) : undefined
      }
      renderItem={({ item }) => renderTile(item, tileWidth)}
      onEndReached={left > 0 ? loadMore : undefined}
      onEndReachedThreshold={0.5}
      initialNumToRender={BATCH_SIZE}
      maxToRenderPerBatch={BATCH_SIZE}
      windowSize={11}
    />
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: PAGE_MAX, alignSelf: 'center' },
  content: { padding: PAGE_PAD, gap: GAP, paddingBottom: 48 },
  header: { marginBottom: 6, gap: 10 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40, fontSize: 15 },
  footer: { alignItems: 'center', gap: 8, paddingTop: 8 },
  count: { color: theme.muted, fontSize: 13 },
});
