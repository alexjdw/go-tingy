import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Problem } from '../../data/samples';
import { initialViewport } from '../../go/viewport';
import {
  DIAMOND_ABOVE,
  GOLD_ABOVE,
  GREEN_ABOVE,
  type MasteryLevel,
  type MasteryResult,
  masteryLevel,
} from '../../progress/mastery';
import type { SkillBar as SkillBarData } from '../../progress/skill';
import { SkillBar } from '../components/SkillBar';
import { allPoints, type Point } from '../../sgf/parser';
import { MasteryRun } from '../../study/mastery';
import { BoardView } from '../components/Board';
import { Btn, MASTERY_COLORS, theme } from '../components/theme';
import { playStone } from '../sound';
import { useZoom, zoomedTap } from '../zoom';

interface Props {
  problem: Problem;
  /** best result so far, to compare against */
  best?: MasteryResult;
  /** joseki mode for this puzzle: every line is solved from both sides */
  joseki?: boolean;
  /** the puzzle's mastery progress */
  bar?: SkillBarData;
  onExit: () => void;
  /** Called once, on the first move: uses up one of today's attempts. */
  onFirstMove: () => void;
  /** Called once, when every line has been solved. */
  onFinish: (r: MasteryResult) => void;
}

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const LEVEL_NAME: Record<MasteryLevel, string> = {
  none: 'No level yet',
  green: 'Green',
  gold: 'Gold',
  diamond: 'Diamond',
};

export function MasteryScreen({ problem, best, joseki, bar, onExit, onFirstMove, onFinish }: Props) {
  const { width } = useWindowDimensions();
  const boardW = Math.min(width - 24, 560);
  const run = useMemo(() => new MasteryRun(problem.sgf, { joseki }), [problem.sgf, joseki]);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [flash, setFlash] = useState<'wrong' | 'right' | null>(null);
  const started = useRef(false);
  const finished = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = useMemo(() => initialViewport(allPoints(run.engine.root), run.engine.dims, run.engine.open), [run]);
  const zoom = useZoom(base);

  // keep the clock display moving
  useEffect(() => {
    const t = setInterval(() => {
      if (run.phase === 'playing' || run.phase === 'between') force();
    }, 250);
    return () => clearInterval(t);
  }, [run]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flashFor = (kind: 'wrong' | 'right') => {
    setFlash(kind);
    setTimeout(() => setFlash(null), 450);
  };

  const handle = (p: Point) => {
    // (read through a function: play() changes the phase, which TypeScript can't see)
    const phase = () => run.phase;
    if (phase() !== 'playing') return;
    if (!started.current) {
      started.current = true;
      onFirstMove();
    }
    const r = run.play(p);
    if (r === 'ok' || r === 'solved') playStone();
    if (r === 'wrong') flashFor('wrong');
    if (r === 'solved') flashFor('right');
    if (phase() === 'between') {
      // the puzzle resets on success or failure and moves to the next line
      timer.current = setTimeout(() => {
        run.advance();
        force();
      }, 650);
    }
    if (phase() === 'done' && !finished.current) {
      finished.current = true;
      onFinish(run.result());
    }
    force();
  };
  const onTap = (p: Point) => zoomedTap(zoom, p, handle);

  const s = run.engine.snap;
  const score = run.score();
  const level = masteryLevel(score);
  const result = run.phase === 'done' ? run.result() : null;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <Btn label="‹ Back" onPress={onExit} kind="ghost" />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title} numberOfLines={1}>
            {problem.title}
          </Text>
          <Text style={styles.sub}>Mastery run</Text>
        </View>
        {zoom.canZoom && run.phase !== 'ready' ? (
          <Btn
            label={zoom.mode === 'off' ? 'Zoom (z)' : zoom.mode === 'armed' ? 'Tap area…' : 'Zoomed'}
            kind={zoom.mode === 'off' ? 'ghost' : 'solid'}
            onPress={zoom.toggle}
          />
        ) : null}
      </View>

      {run.phase === 'ready' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {run.totalLines} line{run.totalLines === 1 ? '' : 's'} to solve
          </Text>
          <Text style={styles.text}>
            Solve every line of this puzzle, in random order. The puzzle resets after each line, whether you got it
            right or made a mistake, and a line you miss comes back later.
          </Text>
          {run.bothSides ? (
            <Text style={styles.text}>
              Joseki mode: every line is played from both sides. From the second side, the first move is played for you.
            </Text>
          ) : null}
          <Text style={styles.text}>
            Score: correct moves per minute, halved for every mistake. Green above {GREEN_ABOVE}, gold above{' '}
            {GOLD_ABOVE}, diamond above {DIAMOND_ABOVE}.
          </Text>
          {run.truncated ? (
            <Text style={styles.text}>This puzzle has very many lines; only the first {run.totalLines} count.</Text>
          ) : null}
          {best ? (
            <Text style={styles.text}>
              Your best: {best.score.toFixed(1)} ({LEVEL_NAME[best.level]})
            </Text>
          ) : null}
          {bar ? <SkillBar bar={bar} height={10} label="Mastery progress" /> : null}
          <Text style={styles.text}>The clock starts when you press Start.</Text>
          <Btn
            label="Start"
            disabled={run.totalLines === 0}
            onPress={() => {
              run.start();
              force();
            }}
          />
        </View>
      ) : (
        <>
          <View
            style={[
              styles.boardBox,
              flash === 'wrong' && styles.wrong,
              flash === 'right' && styles.right,
              zoom.mode === 'armed' && styles.armed,
            ]}
          >
            <BoardView
              board={s.board}
              view={zoom.view}
              width={boardW}
              last={s.last}
              hints={[]}
              markup={run.engine.markup()}
              onPlay={onTap}
              open={run.engine.open}
              animKey={run.engine.placed}
              disabled={run.phase !== 'playing'}
            />
          </View>

          <View style={styles.hud}>
            <Stat label="Lines" value={`${run.solvedLines}/${run.totalLines}`} />
            <Stat label="Time" value={mmss(run.elapsedMs())} />
            <Stat label="Moves" value={String(run.moves)} />
            <Stat label="Mistakes" value={String(run.mistakes)} />
            <Stat label="Score" value={score.toFixed(1)} color={MASTERY_COLORS[level]} />
          </View>

          {run.phase === 'playing' ? (
            <Text style={styles.text}>
              {s.message || `You play ${run.engine.playerColor === 'B' ? 'Black' : 'White'}`}
            </Text>
          ) : null}
          {run.phase === 'between' ? (
            <Text style={[styles.status, { color: run.lastOutcome === 'success' ? MASTERY_COLORS.green : '#e5484d' }]}>
              {run.lastOutcome === 'success' ? 'Line solved — next line…' : 'Mistake — next line…'}
            </Text>
          ) : null}
        </>
      )}

      {result ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            All {result.lines} line{result.lines === 1 ? '' : 's'} solved
          </Text>
          <View style={[styles.badge, { backgroundColor: MASTERY_COLORS[result.level] }]}>
            <Text style={styles.badgeText}>{LEVEL_NAME[result.level]}</Text>
          </View>
          <Text style={styles.text}>
            Score {result.score.toFixed(1)} · {result.moves} correct moves in {mmss(result.ms)} · {result.mistakes}{' '}
            mistake{result.mistakes === 1 ? '' : 's'}
          </Text>
          {best && best.score > result.score ? (
            <Text style={styles.text}>Your best is still {best.score.toFixed(1)}.</Text>
          ) : (
            <Text style={styles.text}>New best!</Text>
          )}
          {bar ? <SkillBar bar={bar} height={10} label="Mastery progress" /> : null}
          <Btn label="Done" onPress={onExit} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, alignItems: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 560 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  sub: { color: theme.muted, fontSize: 13 },
  boardBox: { borderRadius: 8, borderWidth: 3, borderColor: 'transparent' },
  wrong: { borderColor: '#e5484d' },
  right: { borderColor: MASTERY_COLORS.green },
  armed: { borderColor: theme.accent },
  card: { backgroundColor: theme.card, borderRadius: 10, padding: 16, gap: 10, width: '100%', maxWidth: 560 },
  cardTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
  text: { color: theme.text, fontSize: 15, textAlign: 'left' },
  status: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  hud: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', width: '100%', maxWidth: 560 },
  stat: { flex: 1, backgroundColor: theme.card, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statValue: { color: theme.text, fontSize: 18, fontWeight: '700' },
  statLabel: { color: theme.muted, fontSize: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  badgeText: { color: '#111', fontWeight: '700' },
});
