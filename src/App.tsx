import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SAMPLES, type Problem } from './data/samples';
import {
  type Category,
  type MasteryResult,
  type MasteryState,
  attemptsLeft,
  emptyMasteryState,
  guidedStatus,
  localDay,
  recordAttemptStart,
  recordGuidedResult,
  recordMasteryResult,
  setCategory,
} from './progress/mastery';
import { type Attempt, type Level, type ProgressMap, computeSkill, recordAttempt } from './progress/skill';
import { loadLibrary, loadProgress, saveLibrary, saveProgress } from './storage/persistence';
import { asyncKv } from './storage/asyncKv';
import { createMasteryStore } from './storage/mastery';
import { Library, type RunKind } from './ui/screens/Library';
import { Study } from './ui/screens/Study';
import { MasteryScreen } from './ui/screens/MasteryScreen';
import { Editor } from './ui/screens/Editor';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { DEFAULT_SETTINGS, type Settings, loadSettings, saveSettings } from './storage/settings';
import { ImportScreen } from './ui/screens/ImportScreen';
import { theme } from './ui/components/theme';
import type { Mode } from './study/engine';
import { learnerDepth } from './study/lines';

type Screen =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'editor'; problem?: Problem }
  | { name: 'study'; problem: Problem; mode: Mode; run?: { freeMoves: number; learnerMoves: number } }
  | { name: 'mastery'; problem: Problem };

const masteryStore = createMasteryStore(asyncKv);

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'library' });
  const [custom, setCustom] = useState<Problem[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mastery, setMastery] = useState<MasteryState>(emptyMasteryState());
  const [ready, setReady] = useState(false);
  // the latest mastery state, so several updates in one event see each other
  const masteryRef = useRef(mastery);

  useEffect(() => {
    void loadLibrary().then(setCustom);
    void loadProgress().then(setProgress);
    void loadSettings().then(setSettings);
    // the saved state, or the newest backup if it is missing or damaged
    void masteryStore.load().then(({ state }) => {
      masteryRef.current = state;
      setMastery(state);
      setReady(true);
    });
  }, []);

  /** Change the mastery state and save it. Returns the new state. */
  const updateMastery = useCallback((fn: (s: MasteryState) => MasteryState) => {
    const next = fn(masteryRef.current);
    masteryRef.current = next;
    setMastery(next);
    void masteryStore.save(next);
    return next;
  }, []);

  /** Snapshot the scores; done whenever a guided or mastery run is left. */
  const backupMastery = useCallback(() => void masteryStore.backup(masteryRef.current), []);

  const record = useCallback(
    async (id: string, a: Attempt): Promise<Level> => {
      const next = recordAttempt(progress, id, a);
      setProgress(next);
      await saveProgress(next);
      return computeSkill(next[id]).level;
    },
    [progress],
  );

  const addProblem = async (p: Problem) => {
    const next = custom.some((c) => c.id === p.id) ? custom.map((c) => (c.id === p.id ? p : c)) : [...custom, p];
    setCustom(next);
    await saveLibrary(next);
    setScreen({ name: 'library' });
  };

  const addMany = async (items: Problem[]) => {
    const next = [...custom, ...items];
    setCustom(next);
    await saveLibrary(next);
    setScreen({ name: 'library' });
  };

  const removeMany = async (ids: string[]) => {
    const drop = new Set(ids);
    const next = custom.filter((c) => !drop.has(c.id));
    setCustom(next);
    await saveLibrary(next);
  };

  const removeProblem = async (p: Problem) => {
    const next = custom.filter((c) => c.id !== p.id);
    setCustom(next);
    await saveLibrary(next);
  };

  const startRun = (problem: Problem, kind: RunKind) => {
    const s = masteryRef.current;
    if (attemptsLeft(s, problem.id, localDay(new Date())) <= 0) return; // two a day
    if (kind === 'mastery') return setScreen({ name: 'mastery', problem });
    const learnerMoves = learnerDepth(problem.sgf);
    const { free } = guidedStatus(s, problem.id, learnerMoves);
    setScreen({ name: 'study', problem, mode: 'unguided', run: { freeMoves: free, learnerMoves } });
  };

  const leaveRun = () => {
    backupMastery();
    setScreen({ name: 'library' });
  };

  /** What to tell the player after a guided run. */
  const guidedMessage = (id: string, learnerMoves: number, correct: boolean) => {
    const now = guidedStatus(masteryRef.current, id, learnerMoves);
    if (!correct) return `Not clean this time, so you'll get ${now.free} free move${now.free === 1 ? '' : 's'} again.`;
    if (now.cleared) return 'Guided stage cleared! Mastery runs are unlocked.';
    return `Clean run! Next time you get ${now.free} free move${now.free === 1 ? '' : 's'}.`;
  };

  if (!ready) return <SafeAreaView style={styles.root} />;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {screen.name === 'library' && (
        <Library
          problems={[...SAMPLES, ...custom]}
          progress={progress}
          mastery={mastery}
          onStart={(problem, mode) => setScreen({ name: 'study', problem, mode })}
          onStartRun={startRun}
          onToggleCategory={(id: string, cat: Category, on: boolean) =>
            updateMastery((s) => setCategory(s, cat, id, on))
          }
          onImport={() => setScreen({ name: 'import' })}
          onDelete={removeProblem}
          onDeleteMany={removeMany}
          onNew={() => setScreen({ name: 'editor' })}
          onEdit={(problem) => setScreen({ name: 'editor', problem })}
          onSettings={() => setScreen({ name: 'settings' })}
        />
      )}
      {screen.name === 'study' && (
        <Study
          key={`${screen.problem.id}-${screen.mode}-${screen.run ? 'run' : 'plain'}`}
          problem={screen.problem}
          mode={screen.mode}
          settings={settings}
          run={screen.run ? { freeMoves: screen.run.freeMoves } : undefined}
          onExit={screen.run ? leaveRun : () => setScreen({ name: 'library' })}
          onResult={(a) => record(screen.problem.id, a)}
          onRunStart={() => updateMastery((s) => recordAttemptStart(s, screen.problem.id, localDay(new Date())))}
          onRunResult={({ correct }) => {
            const id = screen.problem.id;
            const L = screen.run?.learnerMoves ?? 0;
            updateMastery((s) => recordGuidedResult(s, id, L, correct));
            return guidedMessage(id, L, correct);
          }}
        />
      )}
      {screen.name === 'mastery' && (
        <MasteryScreen
          key={screen.problem.id}
          problem={screen.problem}
          best={mastery.scores[screen.problem.id]?.best}
          onExit={leaveRun}
          onFirstMove={() => updateMastery((s) => recordAttemptStart(s, screen.problem.id, localDay(new Date())))}
          onFinish={(r: MasteryResult) => updateMastery((s) => recordMasteryResult(s, screen.problem.id, r))}
        />
      )}
      {screen.name === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={(s) => {
            setSettings(s);
            void saveSettings(s);
          }}
          onBack={() => setScreen({ name: 'library' })}
        />
      )}
      {screen.name === 'editor' && (
        <Editor initial={screen.problem} onCancel={() => setScreen({ name: 'library' })} onSave={addProblem} />
      )}
      {screen.name === 'import' && (
        <ImportScreen
          existing={[...SAMPLES, ...custom].map((p) => p.sgf)}
          onCancel={() => setScreen({ name: 'library' })}
          onImport={addMany}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 },
});
