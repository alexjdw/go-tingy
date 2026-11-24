import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { SgfNode } from '../../sgf/parser';
import type { LayoutNode, TreeLayout } from '../../study/treeLayout';
import { theme } from './theme';

const GAP = 30;
const PAD = 18;
const R = 11;
const GREEN = '#2fa84f';
const RED = '#e5484d';

const cx = (n: LayoutNode) => PAD + n.depth * GAP;
const cy = (n: LayoutNode) => PAD + n.row * GAP;

/** The picture of the tree itself. It does not depend on the current position, so moving along it draws nothing again. */
const Drawing = memo(function Drawing({ layout, onSelect }: { layout: TreeLayout; onSelect: (node: SgfNode) => void }) {
  return (
    <G>
      {layout.nodes.map((n, i) =>
        n.parent ? (
          <Line
            key={`l${i}`}
            x1={cx(n.parent)}
            y1={cy(n.parent)}
            x2={cx(n.parent)}
            y2={cy(n)}
            stroke={theme.muted}
            strokeWidth={1.5}
          />
        ) : null,
      )}
      {layout.nodes.map((n, i) =>
        n.parent ? (
          <Line
            key={`h${i}`}
            x1={cx(n.parent)}
            y1={cy(n)}
            x2={cx(n)}
            y2={cy(n)}
            stroke={theme.muted}
            strokeWidth={1.5}
          />
        ) : null,
      )}
      {layout.nodes.map((n, i) => {
        const ring = n.mark === 'correct' ? GREEN : n.mark === 'wrong' ? RED : null;
        const black = n.color === 'B';
        return (
          <G key={`n${i}`}>
            {n.color ? (
              <Circle
                cx={cx(n)}
                cy={cy(n)}
                r={R}
                fill={black ? '#181a1f' : '#eeeee9'}
                stroke={ring ?? (black ? '#8a8f99' : '#555')}
                strokeWidth={ring ? 3 : 1}
              />
            ) : (
              <Rect
                x={cx(n) - R * 0.7}
                y={cy(n) - R * 0.7}
                width={R * 1.4}
                height={R * 1.4}
                rx={3}
                fill={theme.muted}
              />
            )}
            {n.color ? (
              <SvgText
                x={cx(n)}
                y={cy(n) + 3.5}
                fontSize={10}
                fontWeight="bold"
                fill={black ? '#fff' : '#111'}
                textAnchor="middle"
              >
                {n.depth}
              </SvgText>
            ) : null}
          </G>
        );
      })}
      {layout.nodes.map((n, i) => (
        <Rect
          key={`t${i}`}
          x={cx(n) - GAP / 2}
          y={cy(n) - GAP / 2}
          width={GAP}
          height={GAP}
          fill="transparent"
          onPress={() => onSelect(n.node)}
        />
      ))}
    </G>
  );
});

interface Props {
  layout: TreeLayout;
  /** the node the board shows; null when the position has left the tree */
  current: SgfNode | null;
  /** must be stable between renders (see `Drawing`) */
  onSelect: (node: SgfNode) => void;
  maxHeight?: number;
}

/** The game tree as a picture: a circle per move, lines of play along rows, the current move ringed. Tap a move to go there. */
export function TreeView({ layout, current, onSelect, maxHeight = 190 }: Props) {
  const width = PAD * 2 + (layout.cols - 1) * GAP;
  const height = PAD * 2 + (layout.rows - 1) * GAP;
  const here = current ? layout.at.get(current) : undefined;

  // keep the current move in view
  const outer = useRef<ScrollViewInstance>(null);
  const inner = useRef<ScrollViewInstance>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!here || !box.w) return;
    inner.current?.scrollTo({ x: Math.max(0, cx(here) - box.w / 2), animated: false });
    outer.current?.scrollTo({ y: Math.max(0, cy(here) - box.h / 2), animated: false });
  }, [here, box.w, box.h]);

  return (
    <View style={styles.box} accessibilityLabel="Move tree">
      <ScrollView
        ref={outer}
        style={{ maxHeight }}
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        nestedScrollEnabled
      >
        <ScrollView ref={inner} horizontal nestedScrollEnabled>
          <Svg width={width} height={height}>
            <Drawing layout={layout} onSelect={onSelect} />
            {here ? (
              <Circle cx={cx(here)} cy={cy(here)} r={R + 4} fill="none" stroke={theme.accent} strokeWidth={3} />
            ) : null}
          </Svg>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', maxWidth: 560, backgroundColor: theme.card, borderRadius: 8 },
});
