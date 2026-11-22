import { useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { Board as GoBoard } from '../../go/board';
import type { Markup } from '../../study/engine';
import { type Viewport, gridGeometry } from '../../go/viewport';
import { type OpenEdges, type Point, NO_OPEN_EDGES } from '../../sgf/parser';

interface Props {
  board: GoBoard;
  view: Viewport;
  width: number;
  last: Point | null;
  hints: Point[];
  /** User-placed candidate marks (choose-the-moves phase). */
  marks?: Point[];
  markup: Markup[];
  onPlay: (p: Point) => void;
  disabled?: boolean;
  /** Sides drawn without a border (the diagram is a crop there). */
  open?: OpenEdges;
  /** Increases whenever a stone is placed; triggers the placement animation. */
  animKey?: number;
}

const STAR_LINES: Record<number, number[]> = { 19: [3, 9, 15], 13: [3, 6, 9], 9: [2, 4, 6] };

/** Hoshi only where both dimensions are standard sizes (so a 19x9 strip gets them, a 7x5 box doesn't). */
const starPoints = (cols: number, rows: number): Point[] => {
  const xs = STAR_LINES[cols];
  const ys = STAR_LINES[rows];
  return xs && ys ? xs.flatMap((x) => ys.map((y) => ({ x, y }))) : [];
};

const ANIM_MS = 200;

export function BoardView({
  board,
  view,
  width,
  last,
  hints,
  marks = [],
  markup,
  onPlay,
  disabled,
  open = NO_OPEN_EDGES,
  animKey = 0,
}: Props) {
  // 0..1 progress of the newest stone's placement animation (1 = idle).
  const [t, setT] = useState(1);
  const prevKey = useRef(animKey);
  useEffect(() => {
    if (animKey <= prevKey.current) {
      prevKey.current = animKey; // undo/reset: no animation
      setT(1);
      return;
    }
    prevKey.current = animKey;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / ANIM_MS);
      setT(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setT(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animKey]);
  const ease = 1 - (1 - t) * (1 - t);

  const { cell, height, px, py, vertical, horizontal } = gridGeometry(
    view,
    { cols: board.cols, rows: board.rows },
    open,
    width,
  );
  const stoneR = cell * 0.47;

  const stars = useMemo(
    () =>
      starPoints(board.cols, board.rows).filter(
        (p) => p.x >= view.x0 && p.x <= view.x1 && p.y >= view.y0 && p.y <= view.y1,
      ),
    [board.cols, board.rows, view],
  );

  const BORDER = 2.2;

  const points: Point[] = [];
  for (let y = view.y0; y <= view.y1; y++) for (let x = view.x0; x <= view.x1; x++) points.push({ x, y });

  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill="#e8b55a" rx={6} />
      {vertical.map((l, i) => (
        <Line
          key={`v${i}`}
          x1={l.x1}
          x2={l.x2}
          y1={l.y1}
          y2={l.y2}
          stroke="#5a4210"
          strokeWidth={l.heavy ? BORDER : 1}
        />
      ))}
      {horizontal.map((l, i) => (
        <Line
          key={`h${i}`}
          x1={l.x1}
          x2={l.x2}
          y1={l.y1}
          y2={l.y2}
          stroke="#5a4210"
          strokeWidth={l.heavy ? BORDER : 1}
        />
      ))}
      {stars.map((p) => (
        <Circle key={`s${p.x},${p.y}`} cx={px(p.x)} cy={py(p.y)} r={cell * 0.1} fill="#5a4210" />
      ))}

      {points.map((p) => {
        const c = board.get(p);
        if (!c) return null;
        const fresh = last && last.x === p.x && last.y === p.y;
        return (
          <G key={`st${p.x},${p.y}`} opacity={fresh ? ease : 1}>
            <Circle
              cx={px(p.x)}
              cy={py(p.y)}
              r={fresh ? stoneR * (0.82 + 0.18 * ease) : stoneR}
              fill={c === 'B' ? '#111' : '#f6f6f2'}
              stroke={c === 'B' ? '#000' : '#888'}
              strokeWidth={1}
            />
          </G>
        );
      })}

      {last && !markup.length ? (
        <Circle
          cx={px(last.x)}
          cy={py(last.y)}
          r={stoneR * 0.45}
          fill="none"
          stroke={board.get(last) === 'B' ? '#fff' : '#111'}
          strokeWidth={2}
        />
      ) : null}

      {hints.map((p) => (
        <Circle key={`h${p.x},${p.y}`} cx={px(p.x)} cy={py(p.y)} r={stoneR * 0.55} fill="#30a46c" opacity={0.75} />
      ))}

      {marks.map((p) => (
        <Circle key={`m${p.x},${p.y}`} cx={px(p.x)} cy={py(p.y)} r={stoneR * 0.6} fill="#4c8dff" opacity={0.85} />
      ))}

      {markup.map((m, i) => {
        const cx = px(m.point.x);
        const cy = py(m.point.y);
        const on = board.get(m.point);
        const col = on === 'B' ? '#fff' : '#c2271b';
        const r = stoneR * 0.55;
        switch (m.kind) {
          case 'TR':
            return (
              <Polygon
                key={i}
                points={`${cx},${cy - r} ${cx - r},${cy + r * 0.8} ${cx + r},${cy + r * 0.8}`}
                fill="none"
                stroke={col}
                strokeWidth={2}
              />
            );
          case 'SQ':
            return (
              <Rect
                key={i}
                x={cx - r * 0.8}
                y={cy - r * 0.8}
                width={r * 1.6}
                height={r * 1.6}
                fill="none"
                stroke={col}
                strokeWidth={2}
              />
            );
          case 'CR':
            return <Circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={2} />;
          case 'MA':
            return (
              <G key={i}>
                <Line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} stroke={col} strokeWidth={2} />
                <Line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} stroke={col} strokeWidth={2} />
              </G>
            );
          case 'LB':
            return (
              <SvgText
                key={i}
                x={cx}
                y={cy + cell * 0.18}
                fontSize={cell * 0.55}
                fontWeight="bold"
                fill={col}
                textAnchor="middle"
              >
                {m.label}
              </SvgText>
            );
        }
      })}

      {/* Touch targets: per-intersection so it works identically on web and native. */}
      {!disabled &&
        points.map((p) => (
          <Rect
            key={`t${p.x},${p.y}`}
            x={px(p.x) - cell / 2}
            y={py(p.y) - cell / 2}
            width={cell}
            height={cell}
            fill="transparent"
            onPress={() => onPlay(p)}
          />
        ))}
    </Svg>
  );
}
