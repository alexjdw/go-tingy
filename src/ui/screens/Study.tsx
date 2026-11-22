import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Problem } from '../../data/samples';
import { StudyEngine, type Mode } from '../../study/engine';
import { allPoints, type Point } from '../../sgf/parser';
import type { Settings } from '../../storage/settings';
import { BoardView } from '../components/Board';
import { initialViewport } from '../../go/viewport';
import { type Attempt, type Level, LEVEL_COLORS } from '../../progress/skill';
import { Btn, theme } from '../components/theme';
import { playStone } from '../sound';
import { useZoom, zoomedTap } from '../zoom';

interface Props {
  problem: Problem;
  mode: Mode;
  settings: Settings;
  onExit: () => void;
  onResult: (a: Attempt) => Promise<Level> | void;
  /**
   * A guided mastery run: this many moves are played for you first, then you solve the rest. Results go to
   * `onRunResult` (not to skill tracking), and undo/restart are hidden so the attempt can't be dodged.
   */
  run?: { freeMoves: number };
  /** Called once, on the first move of a run: it uses up one of today's attempts. */
  onRunStart?: () => void;
  /** Called when the run is solved. May return a message to show, like what the next stage will be. */
  onRunResult?: (r: { correct: boolean }) => string | void;
}

const MODE_LABEL: Record<Mode, string> = {
  guided: 'Guided',
  unguided: 'Unguided',
  explore: 'Free exploration',
};

export function Study({ problem, mode, settings, onExit, onResult, run, onRunStart, onRunResult }: Props) {
  const { width } = useWindowDimensions();
  const boardW = Math.min(width - 24, 560);
  const engine = useMemo(
    () =>
      new StudyEngine(problem.sgf, mode, {
        markChoices: run ? 'off' : settings.markChoices,
        flipColors: settings.flipColors,
        freeMoves: run?.freeMoves,
      }),
    [problem.sgf, mode, settings, run?.freeMoves], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const base = useMemo(() => initialViewport(allPoints(engine.root), engine.dims, engine.open), [engine]);
  const zoom = useZoom(base);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [flash, setFlash] = useState<'wrong' | null>(null);
  const [showBook, setShowBook] = useState(false);
  const [earned, setEarned] = useState<Level | null>(null);
  const [runMessage, setRunMessage] = useState('');
  const runStarted = useRef(false);

  // Timer starts on the first board interaction (or when the replay finishes), not on screen open.
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (mode === 'explore') return;
    const t = setInterval(() => {
      if (startRef.current != null && engine.snap.status !== 'solved') setElapsed(Date.now() - startRef.current);
    }, 250);
    return () => clearInterval(t);
  }, [engine, mode]);

  // Replay up to the branching point, one stone at a time.
  const phase = engine.phase;
  useEffect(() => {
    if (phase !== 'replay') return;
    const t = setInterval(() => {
      if (engine.replayStep()) playStone();
      if (engine.phase !== 'replay') {
        clearInterval(t);
        startRef.current = Date.now();
      }
      force();
    }, 550);
    return () => clearInterval(t);
  }, [engine, phase]);

  const s = engine.snap;
  const hints = phase === 'play' && (mode === 'guided' || showBook) ? engine.bookMoves() : [];

  const shake = () => {
    setFlash('wrong');
    setTimeout(() => setFlash(null), 500);
  };

  const handle = (p: { x: number; y: number }) => {
    if (phase === 'replay') return;
    if (phase === 'mark') {
      engine.toggleMark(p);
      force();
      return;
    }
    if (run && !runStarted.current) {
      runStarted.current = true;
      onRunStart?.();
    }
    if (startRef.current == null) startRef.current = Date.now();
    const r = engine.play(p);
    if (r === 'ok' || r === 'solved') playStone();
    if (r === 'wrong') shake();
    if (r === 'solved') {
      const ms = Date.now() - startRef.current;
      setElapsed(ms);
      if (run) {
        const msg = onRunResult?.({ correct: engine.mistakes === 0 });
        if (msg) setRunMessage(msg);
      } else if (engine.tracksSkill) {
        void Promise.resolve(onResult(engine.attempt(ms))).then((lvl) => {
          if (lvl) setEarned(lvl);
        });
      }
    }
    force();
  };
  const onTap = (p: Point) => zoomedTap(zoom, p, handle);

  const submit = () => {
    if (engine.submitMarks() === 'wrong') shake();
    force();
  };

  const restart = () => {
    engine.reset();
    startRef.current = null;
    setElapsed(0);
    setEarned(null);
    setShowBook(false);
    zoom.reset();
    force();
  };

  const toMove = s.toPlay === 'B' ? 'Black' : 'White';
  const me = engine.playerColor === 'B' ? 'Black' : 'White';
  let status: string;
  if (phase === 'replay') status = 'Watch the moves…';
  else if (phase === 'mark') status = `Mark every move that could be correct (${engine.marks.length} marked)`;
  else if (s.status === 'solved')
    status =
      mode === 'unguided'
        ? engine.mistakes === 0
          ? 'Solved — no mistakes!'
          : `Solved with ${engine.mistakes} mistake${engine.mistakes > 1 ? 's' : ''}`
        : 'Done!';
  else if (mode === 'explore') status = `${toMove} to play`;
  else if (mode === 'unguided' && engine.choicePoints().length) status = `${me} to play — pick a lettered point`;
  else status = `You play ${me}`;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <Btn label="‹ Back" onPress={onExit} kind="ghost" />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title} numberOfLines={1}>
            {problem.title}
          </Text>
          <Text style={styles.sub}>
            {run
              ? `Guided mastery · ${engine.freeMovesPlayed} free move${engine.freeMovesPlayed === 1 ? '' : 's'}`
              : MODE_LABEL[mode]}
            {mode !== 'explore' ? ` · ${(elapsed / 1000).toFixed(0)}s` : ''}
            {engine.flipped ? ' · colors flipped' : ''}
          </Text>
        </View>
        {zoom.canZoom ? (
          <Btn
            label={zoom.mode === 'off' ? 'Zoom (z)' : zoom.mode === 'armed' ? 'Tap area…' : 'Zoomed'}
            kind={zoom.mode === 'off' ? 'ghost' : 'solid'}
            onPress={zoom.toggle}
          />
        ) : null}
      </View>

      <View style={[styles.boardBox, flash === 'wrong' && styles.wrong, zoom.mode === 'armed' && styles.armed]}>
        <BoardView
          board={s.board}
          view={zoom.view}
          width={boardW}
          last={s.last}
          hints={hints}
          marks={engine.marks}
          markup={engine.markup()}
          onPlay={onTap}
          open={engine.open}
          animKey={engine.placed}
          disabled={phase === 'replay' || (s.status === 'solved' && mode !== 'explore')}
        />
      </View>

      <Text style={[styles.status, s.status === 'solved' && phase === 'play' && { color: LEVEL_COLORS.green }]}>
        {status}
      </Text>
      {earned ? (
        <View style={[styles.badge, { backgroundColor: LEVEL_COLORS[earned] }]}>
          <Text style={styles.badgeText}>Skill level: {earned}</Text>
        </View>
      ) : null}
      {runMessage ? <Text style={styles.status}>{runMessage}</Text> : null}
      {s.message || engine.comment() ? <Text style={styles.comment}>{s.message || engine.comment()}</Text> : null}

      <View style={styles.row}>
        {phase === 'mark' ? <Btn label="Submit choices" onPress={submit} disabled={engine.marks.length === 0} /> : null}
        {run ? null : (
          <>
            <Btn
              label="Undo"
              onPress={() => {
                engine.undo();
                force();
              }}
              disabled={!engine.canUndo}
            />
            <Btn label="Restart" onPress={restart} />
          </>
        )}
        {mode === 'explore' ? (
          <>
            <Btn
              label="Pass"
              onPress={() => {
                engine.pass();
                force();
              }}
            />
            <Btn label={showBook ? 'Hide book' : 'Show book'} onPress={() => setShowBook((v) => !v)} />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, alignItems: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 560 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  sub: { color: theme.muted, fontSize: 13 },
  boardBox: { borderRadius: 8, borderWidth: 3, borderColor: 'transparent' },
  wrong: { borderColor: LEVEL_COLORS.red },
  armed: { borderColor: theme.accent },
  status: { color: theme.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  comment: { color: theme.text, fontSize: 15, maxWidth: 560, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  badgeText: { color: '#111', fontWeight: '700', textTransform: 'capitalize' },
});
