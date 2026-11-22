import type { ReactElement } from 'react';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { theme } from './theme';

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

/** Puzzles as a grid of tiles, as many columns as fit. */
export function PuzzleGrid<T>({ data, keyExtractor, renderTile, header, empty }: Props<T>) {
  const { width } = useWindowDimensions();
  const { cols, tileWidth, gap } = gridLayout(width);
  return (
    <FlatList
      key={cols} // FlatList needs a new key when the column count changes
      data={data}
      numColumns={cols}
      keyExtractor={keyExtractor}
      columnWrapperStyle={{ gap }}
      contentContainerStyle={styles.content}
      style={styles.list}
      ListHeaderComponent={header ? <View style={styles.header}>{header}</View> : undefined}
      ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
      renderItem={({ item }) => renderTile(item, tileWidth)}
      initialNumToRender={cols * 3}
      windowSize={7}
    />
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: PAGE_MAX, alignSelf: 'center' },
  content: { padding: PAGE_PAD, gap: GAP, paddingBottom: 48 },
  header: { marginBottom: 6, gap: 10 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40, fontSize: 15 },
});
