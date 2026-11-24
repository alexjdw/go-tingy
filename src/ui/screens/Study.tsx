import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Problem } from '../../data/samples';
import { StudyEngine, chooseFlip, hasSecondSide, rollTri, type Mode } from '../../study/engine';
import { allPoints, boardDims, type Point, type SgfNode } from '../../sgf/parser';
import { layoutTree } from '../../study/treeLayout';
import type { Settings } from '../../storage/settings';
import { BoardView } from '../components/Board';
import { initialViewport } from '../../go/viewport';
import {
  type Attempt,
  type SelfRating,
  type SkillBar as SkillBarData,
  LEVEL_COLORS,
  SELF_LABEL,
  worseRating,
} from '../../progress/skill';
import { RatingPrompt } from '../components/RatingPrompt';
import { RunTutorial } from '../components/RunTutorial';
import { SolvedStamp } from '../components/SolvedStamp';
import { SkillBar } from '../components/SkillBar';
import { TreeView } from '../components/TreeView';
import { Btn, theme } from '../components/theme';
import { useArrowKeys } from '../keys';
import { playStone } from '../sound';
import { useZoom, zoomedTap } from '../zoom';

interface Props {
  problem: Problem;
  mode: Mode;
  settings: Settings;
  onExit: () => void;
  /** Spaced-repetition sessions only: records the attempt. Normal play records nothing. */
  onResult?: (a: Attempt) => Promise<void> | void;
  /**
   * A guided learning run: this many moves are played for you first, then you solve the rest. Results go to
   * `onRunResult` (not to skill tracking), and undo/restart are hidden so the attempt can't be dodged.
   */
  run?: { freeMoves: number };
  /** Called once, on the first move of a run: it uses up one of today's attempts. */
  onRunStart?: () => void;
  /** Called when the run is solved. May return a message to show, like what the next stage will be. */
  onRunResult?: (r: { correct: boolean; rating?: SelfRating }) => string | void;
  /**
   * Part of a spaced-repetition session: shows where you are, offers Skip, and Next once the puzzle is solved.
   * Restart is hidden (it would wipe the mistakes that the session records).
   */
  session?: { position: number; total: number; isLast: boolean };
  onNext?: () => void;
  onSkip?: () => void;
  /** Browse: lets the player switch between hints, solving and free exploration. */
  onModeChange?: (mode: Mode) => void;
  /**
   * The color flip chosen when this puzzle was first opened (the app remembers it while the puzzle stays open, so
   * switching between hints, solving and exploring does not change the colors), and a way to report a new choice.
   */
  flipLock?: boolean;
  onFlipLock?: (flipped: boolean) => void;
  /**
   * Joseki mode for this puzzle: solve it from the first side, then again from the second. The player's choice is
   * remembered by the app. Not offered in guided learning runs or free exploration.
   */
  joseki?: boolean;
  onJosekiChange?: (on: boolean) => void;
  /** A guided learning run: the puzzle's learning progress, shown once the run is solved. */
  runBar?: SkillBarData;
  /** Show the first-time introduction to guided runs, until onTutorialDone. */
  tutorial?: string;
  onTutorialDone?: () => void;
}

const MODE_LABEL: Record<Mode, string> = {
  guided: 'Guided',
  unguided: 'Unguided',
  explore: 'Free exploration',
};

export function Study({
  problem,
  mode,
  settings,
  onExit,
  onResult,
  run,
  onRunStart,
  onRunResult,
  session,
  onNext,
  onSkip,
  onModeChange,
  flipLock,
  onFlipLock,
  joseki = false,
  onJosekiChange,
  runBar,
  tutorial,
  onTutorialDone,
}: Props) {
  const { width } = useWindowDimensions();
  const boardW = Math.min(width - 24, 560);
  // Joseki mode: a second pass from the other side, with the same colors as the first.
  const twoSided = useMemo(
    () => joseki && mode !== 'explore' && hasSecondSide(problem.sgf),
    [joseki, mode, problem.sgf],
  );
  const [side, setSide] = useState<'first' | 'second'>('first');
  // Chosen once when the puzzle loads, then kept: for every mode, restart and joseki side.
  const [flip] = useState(() => flipLock ?? chooseFlip(settings.flipColors));
  useEffect(() => onFlipLock?.(flip), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Paper mode (solving only): a still diagram, solved in the head and then rated. Chosen once, like the flip.
  const [paper] = useState(() => mode === 'unguided' && rollTri(settings.paper));
  const [asking, setAsking] = useState(false);
  const [rating, setRating] = useState<SelfRating | null>(null);
  const [carry, setCarry] = useState<{ mistakes: number; ms: number; parMs: number; self?: SelfRating } | null>(null);
  const activeSide = twoSided ? side : 'first';
  const engine = useMemo(
    () =>
      new StudyEngine(problem.sgf, mode, {
        markChoices: run || paper || activeSide === 'second' ? 'off' : settings.markChoices,
        flipColors: settings.flipColors,
        freeMoves: run?.freeMoves,
        follow: !!run,
        side: activeSide,
        flipped: flip,
      }),
    [problem.sgf, mode, settings, run?.freeMoves, activeSide, flip], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** The first side of a joseki is done, and the other side is still to play. */
  const sidePending = twoSided && side === 'first' && (paper ? rating !== null : engine.snap.status === 'solved');
  const base = useMemo(() => initialViewport(allPoints(engine.root), engine.dims, engine.open), [engine]);
  const zoom = useZoom(base);
  const [, force] = useReducer((n: number) => n + 1, 0);
  // Explore mode walks the tree: the arrow keys (and the tree picture) step along it.
  const stepBack = useCallback(() => {
    if (engine.back()) force();
  }, [engine]);
  const stepForward = useCallback(() => {
    if (engine.forward()) force();
  }, [engine]);
  const jumpTo = useCallback(
    (node: SgfNode) => {
      if (engine.jumpTo(node)) force();
    },
    [engine],
  );
  useArrowKeys(mode === 'explore' ? { onLeft: stepBack, onRight: stepForward } : null);
  const treeLayout = useMemo(
    () => (mode === 'explore' ? layoutTree(engine.root, boardDims(engine.root)) : null),
    [engine, mode],
  );
  const [flash, setFlash] = useState<'wrong' | null>(null);
  const [showBook, setShowBook] = useState(false);
  const [runMessage, setRunMessage] = useState('');
  const runStarted = useRef(false);

  // Timer starts on the first board interaction (or when the replay finishes), not on screen open.
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /** Paper mode: the player has said Done, so the clock stops. */
  const stopped = useRef(false);
  useEffect(() => {
    if (mode === 'explore') return;
    const t = setInterval(() => {
      if (startRef.current != null && engine.snap.status !== 'solved' && !stopped.current)
        setElapsed(Date.now() - startRef.current);
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
  /** Paper mode, the part where the diagram is only looked at (after any given moves were clicked through). */
  const looking = paper && phase === 'play';
  useEffect(() => {
    if (!looking) return;
    zoom.reset(); // the zoom needs taps, which a still diagram does not take
    if (startRef.current == null) startRef.current = Date.now();
  }, [looking]); // eslint-disable-line react-hooks/exhaustive-deps
  const followHint = engine.followHint();
  const hints = followHint
    ? [followHint]
    : phase === 'play' && (mode === 'guided' || showBook)
      ? engine.bookMoves()
      : [];

  const shake = () => {
    setFlash('wrong');
    setTimeout(() => setFlash(null), 500);
  };

  /**
   * A side is over: solved on the board, or (paper mode) rated by the player, who gives `self`. The first side of a
   * joseki waits for the other; otherwise the result goes to the guided run or the spaced-repetition session.
   */
  const finishAttempt = (ms: number, mistakes: number, self?: SelfRating) => {
    if (twoSided && side === 'first') {
      setCarry({ mistakes, ms, parMs: engine.parMs(), self });
    } else if (run) {
      // a joseki run is clean only if both sides were
      const msg = onRunResult?.({
        correct: mistakes === 0 && (carry?.mistakes ?? 0) === 0,
        rating: worseRating(carry?.self, self),
      });
      if (msg) setRunMessage(msg);
    } else if (engine.tracksSkill && session && onResult) {
      const one: Attempt = self
        ? { correct: mistakes === 0, ms, parMs: engine.parMs(), at: Date.now(), self }
        : engine.attempt(ms);
      // a joseki is one attempt over both sides: right only if both were clean, with both times added up
      const attempt: Attempt = carry
        ? {
            ...one,
            correct: one.correct && carry.mistakes === 0,
            ms: one.ms + carry.ms,
            parMs: one.parMs + carry.parMs,
            ...(carry.self || one.self ? { self: worseRating(carry.self, one.self) } : {}),
          }
        : one;
      void onResult(attempt);
    }
  };

  const handle = (p: { x: number; y: number }) => {
    if (phase === 'replay') return;
    if (phase === 'follow') {
      if (engine.follow(p) === 'ok') {
        playStone();
        if (engine.phase !== 'follow') startRef.current = Date.now();
      }
      force();
      return;
    }
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
      finishAttempt(ms, engine.mistakes);
    }
    force();
  };

  /** Paper mode: "Done" asks how it went; this takes the answer. */
  const rate = (r: SelfRating) => {
    const ms = startRef.current != null ? Date.now() - startRef.current : 0;
    stopped.current = true;
    setElapsed(ms);
    setAsking(false);
    setRating(r);
    finishAttempt(ms, r === 'toohard' ? 1 : 0, r);
    force();
  };
  const paperDone = () => {
    if (run && !runStarted.current) {
      runStarted.current = true;
      onRunStart?.();
    }
    setAsking(true);
  };
  const clearPaper = () => {
    stopped.current = false;
    setAsking(false);
    setRating(null);
  };
  const onTap = (p: Point) => zoomedTap(zoom, p, handle);

  const submit = () => {
    if (engine.submitMarks() === 'wrong') shake();
    force();
  };

  /** Go back to the first side, e.g. after joseki mode is switched on or off. */
  const resetSides = () => {
    clearPaper();
    setSide('first');
    setCarry(null);
    startRef.current = null;
    setElapsed(0);
    setShowBook(false);
    zoom.reset();
  };

  const otherSide = () => {
    clearPaper();
    setSide('second');
    startRef.current = null;
    setElapsed(0);
    setShowBook(false);
    zoom.reset();
  };

  const restart = () => {
    if (twoSided && side === 'second') {
      resetSides(); // a restart goes back to the first side, the way a joseki starts
      return;
    }
    clearPaper();
    engine.reset();
    startRef.current = null;
    setElapsed(0);
    setShowBook(false);
    zoom.reset();
    force();
  };

  const toMove = s.toPlay === 'B' ? 'Black' : 'White';
  const me = engine.playerColor === 'B' ? 'Black' : 'White';
  let status: string;
  if (phase === 'replay') status = 'Watch the moves…';
  else if (phase === 'follow') status = 'Follow the green dot';
  else if (phase === 'mark') status = `Mark every move that could be correct (${engine.marks.length} marked)`;
  else if (sidePending)
    status = paper
      ? 'First side rated. Now the other side.'
      : 'First side solved! Now play it again from the other side.';
  else if (paper && rating) status = `You rated it: ${SELF_LABEL[rating]}`;
  else if (looking) status = asking ? 'Done thinking?' : `Solve it in your head as ${me}, then tap Done`;
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
        <Btn label={session ? '‹ End' : '‹ Back'} onPress={onExit} kind="ghost" />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title} numberOfLines={1}>
            {problem.title}
          </Text>
          <Text style={styles.sub}>
            {run
              ? `Guided learning · ${engine.freeMovesPlayed} free move${engine.freeMovesPlayed === 1 ? '' : 's'}`
              : session
                ? `Review ${session.position} of ${session.total}`
                : MODE_LABEL[mode]}
            {twoSided ? ` · joseki, side ${side === 'first' ? 1 : 2} of 2` : ''}
            {mode !== 'explore' ? ` · ${(elapsed / 1000).toFixed(0)}s` : ''}
            {engine.flipped ? ' · colors flipped' : ''}
            {paper ? ' · paper' : ''}
          </Text>
        </View>
        {zoom.canZoom && !looking ? (
          <Btn
            label={zoom.mode === 'off' ? 'Zoom (z)' : zoom.mode === 'armed' ? 'Tap area…' : 'Zoomed'}
            kind={zoom.mode === 'off' ? 'ghost' : 'solid'}
            onPress={zoom.toggle}
          />
        ) : null}
      </View>

      {onModeChange && !run && !session ? (
        <View style={styles.row}>
          {(
            [
              ['guided', 'Hints'],
              ['unguided', 'Solve'],
              ['explore', 'Explore'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <Btn key={m} label={label} kind={mode === m ? 'solid' : 'ghost'} onPress={() => onModeChange(m)} />
          ))}
        </View>
      ) : null}

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
          disabled={phase === 'replay' || looking || (s.status === 'solved' && mode !== 'explore')}
          paper={paper}
        />
        {s.status === 'solved' && mode !== 'explore' ? <SolvedStamp /> : null}
      </View>

      {tutorial && onTutorialDone ? <RunTutorial onDone={onTutorialDone} /> : null}
      <Text style={[styles.status, s.status === 'solved' && phase === 'play' && { color: LEVEL_COLORS.green }]}>
        {status}
      </Text>
      {asking ? <RatingPrompt onRate={rate} /> : null}
      {run && (paper ? rating !== null : s.status === 'solved') && !sidePending && runBar ? (
        <View style={styles.skill}>
          <SkillBar bar={runBar} height={10} label="Learning progress" />
        </View>
      ) : null}
      {runMessage ? <Text style={styles.status}>{runMessage}</Text> : null}
      {s.message || engine.comment() ? <Text style={styles.comment}>{s.message || engine.comment()}</Text> : null}

      {treeLayout ? (
        <>
          <TreeView layout={treeLayout} current={s.node} onSelect={jumpTo} />
          {Platform.OS === 'web' ? (
            <Text style={styles.sub}>← → step through the moves; tap a move to go there.</Text>
          ) : null}
        </>
      ) : null}

      <View style={styles.row}>
        {looking && !asking && rating === null ? <Btn label="Done" onPress={paperDone} /> : null}
        {phase === 'mark' ? <Btn label="Submit choices" onPress={submit} disabled={engine.marks.length === 0} /> : null}
        {run ? null : (
          <>
            {paper ? null : (
              <Btn
                label="Undo"
                onPress={() => {
                  engine.undo();
                  force();
                }}
                disabled={!engine.canUndo}
              />
            )}
            {session ? null : <Btn label="Restart" onPress={restart} />}
            {onJosekiChange && mode !== 'explore' ? (
              <Btn
                label={joseki ? 'Joseki mode: on' : 'Joseki mode: off'}
                kind={joseki ? 'solid' : 'ghost'}
                accessibilityLabel={joseki ? 'Joseki mode on' : 'Joseki mode off'}
                onPress={() => {
                  if (side === 'second') resetSides();
                  onJosekiChange(!joseki);
                }}
              />
            ) : null}
          </>
        )}
        {sidePending ? <Btn label="Other side ›" onPress={otherSide} /> : null}
        {mode === 'explore' ? (
          <>
            <Btn label="Forward ›" onPress={stepForward} disabled={!engine.canForward} />
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
        {session ? (
          (paper ? rating !== null : s.status === 'solved') && !sidePending ? (
            <Btn label={session.isLast ? 'Finish' : 'Next ›'} onPress={() => onNext?.()} />
          ) : sidePending ? null : (
            <Btn label="Skip" kind="ghost" onPress={() => onSkip?.()} />
          )
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
  skill: { width: '100%', maxWidth: 560, paddingHorizontal: 12 },
});
