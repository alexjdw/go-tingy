import { useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { Board as GoBoard } from '../../go/board';
import type { Markup } from '../../study/engine';
import type { Point } from '../../sgf/parser';

export interface Viewport {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Crop to the area around the stones, snapping to board edges (typical tsumego diagram). */
export function computeViewport(points: Point[], size: number): Viewport {
  if (!points.length) return { x0: 0, x1: size - 1, y0: 0, y1: size - 1 };
  let x0 = Math.min(...points.map((p) => p.x));
  let x1 = Math.max(...points.map((p) => p.x));
  let y0 = Math.min(...points.map((p) => p.y));
  let y1 = Math.max(...points.map((p) => p.y));
  const pad = 2;
  const snap = 3;
  x0 = x0 - pad <= snap ? 0 : x0 - pad;
  y0 = y0 - pad <= snap ? 0 : y0 - pad;
  x1 = x1 + pad >= size - 1 - snap ? size - 1 : x1 + pad;
  y1 = y1 + pad >= size - 1 - snap ? size - 1 : y1 + pad;
  // ensure a usable minimum
  if (x1 - x0 < 6) x1 = Math.min(size - 1, x0 + 6);
  if (y1 - y0 < 6) y1 = Math.min(size - 1, y0 + 6);
  return { x0, x1, y0, y1 };
}

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
  /** Increases whenever a stone is placed; triggers the placement animation. */
  animKey?: number;
}

const starPoints = (size: number): Point[] => {
  if (size === 19) return [3, 9, 15].flatMap((x) => [3, 9, 15].map((y) => ({ x, y })));
  if (size === 13) return [3, 6, 9].flatMap((x) => [3, 6, 9].map((y) => ({ x, y })));
  if (size === 9) return [2, 4, 6].flatMap((x) => [2, 4, 6].map((y) => ({ x, y })));
  return [];
};

const ANIM_MS = 200;

export function BoardView({ board, view, width, last, hints, marks = [], markup, onPlay, disabled, animKey = 0 }: Props) {
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

  const cols = view.x1 - view.x0 + 1;
  const rows = view.y1 - view.y0 + 1;
  const margin = 0.8; // in cells
  const cell = width / (cols - 1 + margin * 2);
  const height = cell * (rows - 1 + margin * 2);
  const px = (x: number) => (x - view.x0 + margin) * cell;
  const py = (y: number) => (y - view.y0 + margin) * cell;
  const stoneR = cell * 0.47;

  const stars = useMemo(
    () => starPoints(board.size).filter((p) => p.x >= view.x0 && p.x <= view.x1 && p.y >= view.y0 && p.y <= view.y1),
    [board.size, view],
  );

  // Grid lines extend half a cell past the edge when the board continues (cropped side).
  const lx0 = view.x0 === 0 ? px(0) : px(view.x0) - cell * 0.5;
  const lx1 = view.x1 === board.size - 1 ? px(view.x1) : px(view.x1) + cell * 0.5;
  const ly0 = view.y0 === 0 ? py(0) : py(view.y0) - cell * 0.5;
  const ly1 = view.y1 === board.size - 1 ? py(view.y1) : py(view.y1) + cell * 0.5;

  const points: Point[] = [];
  for (let y = view.y0; y <= view.y1; y++) for (let x = view.x0; x <= view.x1; x++) points.push({ x, y });

  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill="#e8b55a" rx={6} />
      {Array.from({ length: cols }, (_, i) => (
        <Line key={`v${i}`} x1={px(view.x0 + i)} x2={px(view.x0 + i)} y1={ly0} y2={ly1} stroke="#5a4210" strokeWidth={1} />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <Line key={`h${i}`} x1={lx0} x2={lx1} y1={py(view.y0 + i)} y2={py(view.y0 + i)} stroke="#5a4210" strokeWidth={1} />
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
            <Circle cx={px(p.x)} cy={py(p.y)} r={fresh ? stoneR * (0.82 + 0.18 * ease) : stoneR} fill={c === 'B' ? '#111' : '#f6f6f2'} stroke={c === 'B' ? '#000' : '#888'} strokeWidth={1} />
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
            return <Polygon key={i} points={`${cx},${cy - r} ${cx - r},${cy + r * 0.8} ${cx + r},${cy + r * 0.8}`} fill="none" stroke={col} strokeWidth={2} />;
          case 'SQ':
            return <Rect key={i} x={cx - r * 0.8} y={cy - r * 0.8} width={r * 1.6} height={r * 1.6} fill="none" stroke={col} strokeWidth={2} />;
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
              <SvgText key={i} x={cx} y={cy + cell * 0.18} fontSize={cell * 0.55} fontWeight="bold" fill={col} textAnchor="middle">
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
