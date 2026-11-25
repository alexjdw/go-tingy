import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, SafeAreaView, StatusBar as RNStatusBar, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SAMPLES, type Problem } from './data/samples';
import {
  type Category,
  type TimedResult,
  type LearningState,
  attemptsLeft,
  emptyLearningState,
  guidedStatus,
  inCategory,
  puzzleTimedLevel,
  isDueNow,
  localDay,
  learningProgress,
  recordAttemptStart,
  recordGuidedResult,
  recordTimedResult,
  setCategory,
  setCategoryMany,
} from './progress/learning';
import { graduateToSpaced, setPriority } from './progress/backlog';
import { type AutoPlan, nextAutoIndex, pickAutoIds } from './study/auto';
import { type RunKind, learningAction } from './progress/practice';
import { type Attempt, type ProgressMap, type SelfRating, recordAttempt } from './progress/skill';
import { depthOf, toDepth } from './nav/history';
import { canGoBack, current, pop, push, replace, reset, type Stack } from './nav/stack';
import {
  loadJoseki,
  loadLibrary,
  loadProgress,
  loadSeen,
  saveJoseki,
  saveLibrary,
  saveProgress,
  saveSeen,
} from './storage/persistence';
import { asyncKv } from './storage/asyncKv';
import { createLearningStore } from './storage/learning';
import { DEFAULT_SETTINGS, type Settings, loadSettings, saveSettings } from './storage/settings';
import { loadDeleted, saveDeleted } from './storage/syncState';
import { cachedLearnerDepth } from './study/lines';
import type { Mode } from './study/engine';
import type { Snapshot } from './sync/snapshot';
import { theme } from './ui/components/theme';
import { DiamondPrompt } from './ui/components/DiamondPrompt';
import { BacklogPicker } from './ui/screens/BacklogPicker';
import { useSync } from './ui/useSync';
import { Browse } from './ui/screens/Browse';
import { Editor } from './ui/screens/Editor';
import { FromGame } from './ui/screens/FromGame';
import { Home } from './ui/screens/Home';
import { collectionsOf, renameCollection as renameCollectionIn } from './sgf/folders';
import { ImportScreen } from './ui/screens/ImportScreen';
import { LearningHome } from './ui/screens/LearningHome';
import { TimedScreen } from './ui/screens/TimedScreen';
import { Prune } from './ui/screens/Prune';
import { SessionScreen } from './ui/screens/SessionScreen';
import { AboutScreen } from './ui/screens/AboutScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { Study } from './ui/screens/Study';
import { getBridge } from './analysis/bridge';

type Screen =
  | { name: 'home' }
  | { name: 'browse'; addTo?: Category }
  | { name: 'learning' }
  | { name: 'session' }
  | { name: 'prune' }
  | { name: 'settings' }
  | { name: 'backlog' }
  | { name: 'about' }
  | { name: 'import' }
  | { name: 'fromGame' }
  | { name: 'editor'; problem?: Problem }
  | {
      name: 'study';
      problem: Problem;
      mode: Mode;
      run?: { freeMoves: number; learnerMoves: number };
      /** the color flip chosen when the puzzle opened, kept while its mode changes */
      flipped?: boolean;
      /** tells two runs of the same puzzle apart (auto mode opens the same puzzle again) */
      nonce?: number;
    }
  | { name: 'timedRun'; problem: Problem; nonce?: number };

const learningStore = createLearningStore(asyncKv);

export default function App() {
  const [stack, setStack] = useState<Stack<Screen>>(() => reset<Screen>({ name: 'home' }));
  const stackRef = useRef(stack);
  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);
  const screen = current(stack);
  const [custom, setCustom] = useState<Problem[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [learning, setLearning] = useState<LearningState>(emptyLearningState());
  const [joseki, setJoseki] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[] | null>(null);
  /** puzzles the player deleted -> when, so the deletion reaches their other devices (see src/sync) */
  const [deleted, setDeleted] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  // the latest learning state, so several updates in one event see each other
  const learningRef = useRef(learning);
  /** guided learning's auto mode, while it is going */
  const autoRef = useRef<AutoPlan | null>(null);
  const nonceRef = useRef(0);
  /** a puzzle that just reached diamond, while the player is asked about moving it to spaced repetition */
  const [diamondId, setDiamondId] = useState<string | null>(null);

  const go = useCallback((s: Screen) => setStack((st) => push(st, s)), []);
  // On the web the browser's history mirrors the stack, so Back is the browser's Back.
  const back = useCallback(() => {
    if (Platform.OS === 'web' && canGoBack(stackRef.current)) window.history.back();
    else setStack((st) => pop(st));
  }, []);
  /** Swap the current screen for another (used by the session end screen, so Back then returns home). */
  const swap = useCallback((s: Screen) => setStack((st) => replace(st, s)), []);

  // The Android back button goes back one screen; from the first screen it leaves the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack(stackRef.current)) return false;
      setStack((st) => pop(st));
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // everything is loaded before the app is ready (a sync must never see half-loaded data)
    void Promise.all([
      loadLibrary().then(setCustom),
      loadProgress().then(setProgress),
      loadSettings().then(setSettings),
      loadJoseki().then(setJoseki),
      loadSeen().then(setSeen),
      loadDeleted().then(setDeleted),
      // the saved state, or the newest backup if it is missing or damaged
      learningStore.load().then(({ state }) => {
        learningRef.current = state;
        setLearning(state);
      }),
    ]).then(() => setReady(true));
  }, []);

  /** Change the learning state and save it. Returns the new state. */
  const updateLearning = useCallback((fn: (s: LearningState) => LearningState) => {
    const next = fn(learningRef.current);
    learningRef.current = next;
    setLearning(next);
    void learningStore.save(next);
    return next;
  }, []);

  /** Snapshot the scores; done whenever a guided or timed run is left. */
  const backupLearning = useCallback(() => void learningStore.backup(learningRef.current), []);

  // Web: one history entry per screen; the browser's Back and Forward buttons move along the stack.
  const forwardRef = useRef<Screen[]>([]);
  const histDepth = useRef(1);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    window.history.replaceState({ depth: 1 }, '');
    const onPop = (e: PopStateEvent) => {
      const before = stackRef.current;
      const next = toDepth({ stack: before, forward: forwardRef.current }, depthOf(e.state));
      forwardRef.current = [...next.forward];
      stackRef.current = next.stack;
      histDepth.current = next.stack.length;
      if (depthOf(e.state) !== next.stack.length) window.history.replaceState({ depth: next.stack.length }, '');
      const left = current(before);
      if (next.stack.length < before.length && (left.name === 'timedRun' || (left.name === 'study' && left.run)))
        backupLearning();
      setStack(next.stack);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [backupLearning]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (stack.length > histDepth.current) {
      forwardRef.current = []; // opening something new drops the screens ahead
      window.history.pushState({ depth: stack.length }, '');
    }
    histDepth.current = stack.length;
  }, [stack]);

  const record = useCallback(
    async (id: string, a: Attempt): Promise<void> => {
      const next = recordAttempt(progress, id, a);
      setProgress(next);
      await saveProgress(next);
    },
    [progress],
  );

  /** The desktop app (it has the KataGo bridge): splitting a puzzle is offered there. */
  const desktop = useMemo(() => getBridge() !== null, []);

  const problems = [...SAMPLES, ...custom];

  const saveProblem = async (p: Problem) => {
    const next = custom.some((c) => c.id === p.id) ? custom.map((c) => (c.id === p.id ? p : c)) : [...custom, p];
    setCustom(next);
    await saveLibrary(next);
    back();
  };

  const addMany = async (items: Problem[]) => {
    const next = [...custom, ...items];
    setCustom(next);
    await saveLibrary(next);
    back();
  };

  const renameCollection = async (from: string, to: string) => {
    const next = renameCollectionIn(custom, from, to);
    setCustom(next);
    await saveLibrary(next);
  };

  const removeMany = async (ids: string[]) => {
    const drop = new Set(ids);
    const next = custom.filter((c) => !drop.has(c.id));
    setCustom(next);
    await saveLibrary(next);
    const now = Date.now();
    const marks = { ...deleted, ...Object.fromEntries(ids.map((id) => [id, now])) };
    setDeleted(marks);
    await saveDeleted(marks);
  };

  // Keep the player's data in step with their Google Drive (web only; see src/sync and src/ui/useSync.ts).
  const customRef = useRef(custom);
  const progressRef = useRef(progress);
  const josekiRef = useRef(joseki);
  const settingsRef = useRef(settings);
  const deletedRef = useRef(deleted);
  useEffect(() => {
    customRef.current = custom;
    progressRef.current = progress;
    josekiRef.current = joseki;
    settingsRef.current = settings;
    deletedRef.current = deleted;
  }, [custom, progress, joseki, settings, deleted]);
  const sync = useSync({
    ready: ready && seen !== null,
    busy: screen.name === 'study' || screen.name === 'timedRun',
    getContent: () => ({
      version: 1,
      library: customRef.current,
      deleted: deletedRef.current,
      progress: progressRef.current,
      joseki: josekiRef.current,
      learning: learningRef.current,
      settings: settingsRef.current,
    }),
    apply: (m: Snapshot) => {
      setCustom(m.library);
      void saveLibrary(m.library);
      setProgress(m.progress);
      void saveProgress(m.progress);
      setJoseki(m.joseki);
      void saveJoseki(m.joseki);
      setDeleted(m.deleted);
      void saveDeleted(m.deleted);
      setSettings(m.settings);
      void saveSettings(m.settings);
      learningRef.current = m.learning;
      setLearning(m.learning);
      void learningStore.save(m.learning);
    },
    version: [custom, progress, joseki, learning, settings, deleted],
  });

  /** A one-time tutorial was finished or dismissed; it is not shown again. */
  const markSeen = (name: string) => {
    const next = [...(seen ?? []), name];
    setSeen(next);
    void saveSeen(next);
  };

  /** Mark or unmark a puzzle as joseki; the app remembers it. */
  const setJosekiMode = (id: string, on: boolean) => {
    const next = on ? (joseki.includes(id) ? joseki : [...joseki, id]) : joseki.filter((x) => x !== id);
    setJoseki(next);
    void saveJoseki(next);
  };

  const toggleCategory = (id: string, cat: Category, on: boolean) => updateLearning((s) => setCategory(s, cat, id, on));
  const toggleCategoryMany = (ids: string[], cat: Category, on: boolean) =>
    updateLearning((s) => setCategoryMany(s, cat, ids, on));

  /** Start the next training step of a learning puzzle: a guided run, or a timed run. */
  const startRun = (problem: Problem, kind: RunKind, nav: (s: Screen) => void = go, nonce?: number) => {
    const s = learningRef.current;
    if (attemptsLeft(s, problem.id, localDay(new Date())) <= 0) return; // two a day
    if (kind === 'learning') return nav({ name: 'timedRun', problem, nonce });
    const learnerMoves = cachedLearnerDepth(problem.sgf);
    const { free } = guidedStatus(s, problem.id, learnerMoves);
    nav({ name: 'study', problem, mode: 'unguided', run: { freeMoves: free, learnerMoves }, nonce });
  };

  /**
   * Auto mode: open the next puzzle that can still be played today, from the current one on. Returns false (and ends
   * auto mode) when there is none.
   */
  const autoStep = (nav: (s: Screen) => void, from: number): boolean => {
    const plan = autoRef.current;
    if (!plan) return false;
    const day = localDay(new Date());
    const s = learningRef.current;
    const items = new Map(problems.map((p) => [p.id, { id: p.id, learnerMoves: cachedLearnerDepth(p.sgf) }] as const));
    const i = nextAutoIndex(plan, from, s, items, day);
    const problem = i === null ? undefined : problems.find((p) => p.id === plan.ids[i]);
    if (i === null || !problem) {
      autoRef.current = null;
      return false;
    }
    const kind = learningAction(s, problem.id, items.get(problem.id)!.learnerMoves, day).kind;
    if (!kind) {
      autoRef.current = null;
      return false;
    }
    autoRef.current = { ...plan, index: i, leftAtOpen: attemptsLeft(s, problem.id, day) };
    startRun(problem, kind, nav, ++nonceRef.current);
    return true;
  };

  const startAuto = (count: number) => {
    const s = learningRef.current;
    const items = problems
      .filter((p) => inCategory(s, 'learning', p.id))
      .map((p) => ({ id: p.id, learnerMoves: cachedLearnerDepth(p.sgf) }));
    const ids = pickAutoIds(items, s, localDay(new Date()), count);
    if (!ids.length) return;
    autoRef.current = { ids, index: 0, leftAtOpen: 0 };
    autoStep(go, 0);
  };

  /** Leave a run. In auto mode a run that used an attempt leads straight on to the next one; backing out ends auto. */
  const leaveRun = () => {
    backupLearning();
    const plan = autoRef.current;
    if (plan) {
      const id = plan.ids[plan.index];
      const left = attemptsLeft(learningRef.current, id, localDay(new Date()));
      if (left < plan.leftAtOpen && autoStep(swap, plan.index)) return;
      autoRef.current = null;
    }
    back();
  };

  // auto mode ends when the player is no longer in a run (for example the browser's Back button)
  useEffect(() => {
    const inRun = screen.name === 'timedRun' || (screen.name === 'study' && !!screen.run);
    if (!inRun) autoRef.current = null;
  }, [screen]);

  /** The player answered the diamond prompt. */
  const answerDiamond = (move: boolean) => {
    const id = diamondId;
    setDiamondId(null);
    if (!id || !move) return;
    const g = graduateToSpaced(learningRef.current, progress, id);
    updateLearning(() => g.learning);
    if (g.progress !== progress) {
      setProgress(g.progress);
      void saveProgress(g.progress);
    }
  };

  /** What to tell the player after a guided run. */
  const guidedMessage = (id: string, learnerMoves: number, correct: boolean, rating?: SelfRating) => {
    const now = guidedStatus(learningRef.current, id, learnerMoves);
    if (rating === 'toohard')
      return `That was too tough, so you'll get ${now.free} free move${now.free === 1 ? '' : 's'} next time.`;
    if (!correct) return `Not clean this time, so you'll get ${now.free} free move${now.free === 1 ? '' : 's'} again.`;
    if (now.cleared) return 'Guided stage cleared! Timed runs are unlocked.';
    return `Clean run! Next time you get ${now.free} free move${now.free === 1 ? '' : 's'}.`;
  };

  if (!ready) return <SafeAreaView style={styles.root} />;

  const day = localDay(new Date());
  const learningMembers = problems.filter((p) => inCategory(learning, 'learning', p.id));
  const spacedMembers = problems.filter((p) => inCategory(learning, 'spaced', p.id));

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {screen.name === 'home' && (
        <Home
          dueCount={problems.filter((p) => isDueNow(learning, p.id, progress[p.id])).length}
          spacedCount={spacedMembers.length}
          learningCount={learningMembers.length}
          learningReady={
            learningMembers.filter((p) => learningAction(learning, p.id, cachedLearnerDepth(p.sgf), day).enabled).length
          }
          puzzleCount={problems.length}
          onLearning={() => go({ name: 'learning' })}
          onSpaced={() => go({ name: 'session' })}
          onBrowse={() => go({ name: 'browse' })}
          onSettings={() => go({ name: 'settings' })}
          sync={sync}
        />
      )}

      {screen.name === 'browse' && (
        <Browse
          addTo={screen.addTo}
          onToggleMany={(ids, category, on) => toggleCategoryMany(ids, category, on)}
          problems={problems}
          progress={progress}
          learning={learning}
          joseki={joseki}
          onJosekiChange={setJosekiMode}
          onBack={back}
          onPlay={(problem) => go({ name: 'study', problem, mode: 'unguided' })}
          onToggleCategory={toggleCategory}
          onNew={() => go({ name: 'editor' })}
          onImport={() => go({ name: 'import' })}
          onFromGame={() => go({ name: 'fromGame' })}
          onEdit={(problem) => go({ name: 'editor', problem })}
          onDelete={(p) => void removeMany([p.id])}
          onDeleteMany={(ids) => void removeMany(ids)}
          onRenameCollection={(from, to) => void renameCollection(from, to)}
        />
      )}

      {screen.name === 'learning' && (
        <LearningHome
          problems={problems}
          progress={progress}
          learning={learning}
          joseki={joseki}
          onJosekiChange={setJosekiMode}
          onBack={back}
          onAddPuzzles={() => go({ name: 'browse', addTo: 'learning' })}
          onPlay={(p, kind) => startRun(p, kind)}
          onAuto={startAuto}
          onToggleCategory={toggleCategory}
        />
      )}

      {screen.name === 'session' && (
        <SessionScreen
          problems={problems}
          learning={learning}
          progress={progress}
          settings={settings}
          record={record}
          joseki={joseki}
          onJosekiChange={setJosekiMode}
          // from the end screen, Add/Prune replace the session so that Back returns home, not to a new session
          onAddPuzzles={() => swap({ name: 'browse', addTo: 'spaced' })}
          onPrune={() => swap({ name: 'prune' })}
          onDone={back}
        />
      )}

      {screen.name === 'prune' && (
        <Prune
          problems={spacedMembers}
          progress={progress}
          onRemove={(p) => toggleCategory(p.id, 'spaced', false)}
          onBack={back}
        />
      )}

      {screen.name === 'study' && (
        <Study
          key={`${screen.problem.id}-${screen.mode}-${screen.run ? 'run' : 'plain'}-${screen.nonce ?? 0}`}
          problem={screen.problem}
          mode={screen.mode}
          settings={settings}
          run={screen.run ? { freeMoves: screen.run.freeMoves } : undefined}
          onModeChange={screen.run ? undefined : (mode) => swap({ ...screen, mode })}
          onSplit={desktop && !screen.run ? (problem) => go({ name: 'editor', problem }) : undefined}
          flipLock={screen.flipped}
          onFlipLock={(flipped) => {
            if (screen.flipped !== flipped) swap({ ...screen, flipped });
          }}
          joseki={joseki.includes(screen.problem.id)}
          onJosekiChange={screen.run ? undefined : (on) => setJosekiMode(screen.problem.id, on)}
          tutorial={screen.run && seen && !seen.includes('guided-run') ? 'guided-run' : undefined}
          onTutorialDone={() => markSeen('guided-run')}
          runBar={screen.run ? learningProgress(learning, screen.problem.id, screen.run.learnerMoves) : undefined}
          onExit={screen.run ? leaveRun : back}
          onRunStart={() => updateLearning((s) => recordAttemptStart(s, screen.problem.id, localDay(new Date())))}
          onRunResult={({ correct, rating }) => {
            const id = screen.problem.id;
            const L = screen.run?.learnerMoves ?? 0;
            updateLearning((s) => recordGuidedResult(s, id, L, correct, rating));
            return guidedMessage(id, L, correct, rating);
          }}
        />
      )}

      {screen.name === 'timedRun' && (
        <TimedScreen
          key={`${screen.problem.id}-${screen.nonce ?? 0}`}
          problem={screen.problem}
          joseki={joseki.includes(screen.problem.id)}
          bar={learningProgress(learning, screen.problem.id, cachedLearnerDepth(screen.problem.sgf))}
          best={learning.scores[screen.problem.id]?.best}
          onExit={leaveRun}
          onFirstMove={() => updateLearning((s) => recordAttemptStart(s, screen.problem.id, localDay(new Date())))}
          onFinish={(r: TimedResult) => {
            const id = screen.problem.id;
            const before = puzzleTimedLevel(learningRef.current, id);
            const next = updateLearning((s) => recordTimedResult(s, id, r));
            // reaching diamond for the first time: offer to move the puzzle to spaced repetition
            if (before !== 'diamond' && puzzleTimedLevel(next, id) === 'diamond') setDiamondId(id);
          }}
        />
      )}

      {screen.name === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={(s) => {
            setSettings(s);
            void saveSettings(s);
          }}
          onBack={back}
          onAbout={() => go({ name: 'about' })}
          onPickBacklog={() => go({ name: 'backlog' })}
          sync={sync}
        />
      )}

      {screen.name === 'backlog' && (
        <BacklogPicker
          problems={problems}
          progress={progress}
          learning={learning}
          joseki={joseki}
          count={settings.backlogCount}
          days={settings.backlogDays}
          onBack={back}
          onConfirm={(ids) => {
            updateLearning((s) => setPriority(s, ids, settings.backlogDays));
            back();
          }}
        />
      )}

      {screen.name === 'about' && <AboutScreen onBack={back} />}

      {screen.name === 'editor' && <Editor initial={screen.problem} onCancel={back} onSave={saveProblem} />}

      {screen.name === 'fromGame' && <FromGame onCancel={back} onSave={saveProblem} />}

      {screen.name === 'import' && (
        <ImportScreen
          existing={problems.map((p) => p.sgf)}
          collectionNames={collectionsOf(problems).map(([c]) => c)}
          onCancel={back}
          onImport={addMany}
        />
      )}
      <DiamondPrompt
        title={diamondId ? (problems.find((p) => p.id === diamondId)?.title ?? 'This puzzle') : null}
        inSpaced={diamondId ? inCategory(learning, 'spaced', diamondId) : false}
        onMove={() => answerDiamond(true)}
        onKeep={() => answerDiamond(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 },
});
