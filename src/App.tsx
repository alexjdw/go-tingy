import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SAMPLES, Problem } from './data/samples';
import { Attempt, Level, ProgressMap, computeSkill, recordAttempt } from './progress/skill';
import { loadLibrary, loadProgress, saveLibrary, saveProgress } from './storage/persistence';
import { Library } from './ui/screens/Library';
import { Study } from './ui/screens/Study';
import { Editor } from './ui/screens/Editor';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { DEFAULT_SETTINGS, Settings, loadSettings, saveSettings } from './storage/settings';
import { ImportScreen } from './ui/screens/ImportScreen';
import { theme } from './ui/components/theme';
import type { Mode } from './study/engine';

type Screen =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'editor'; problem?: Problem }
  | { name: 'study'; problem: Problem; mode: Mode };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'library' });
  const [custom, setCustom] = useState<Problem[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadLibrary().then(setCustom);
    loadProgress().then(setProgress);
    loadSettings().then(setSettings);
  }, []);

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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {screen.name === 'library' && (
        <Library
          problems={[...SAMPLES, ...custom]}
          progress={progress}
          onStart={(problem, mode) => setScreen({ name: 'study', problem, mode })}
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
          key={`${screen.problem.id}-${screen.mode}`}
          problem={screen.problem}
          mode={screen.mode}
          settings={settings}
          onExit={() => setScreen({ name: 'library' })}
          onResult={(a) => record(screen.problem.id, a)}
        />
      )}
      {screen.name === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={(s) => {
            setSettings(s);
            saveSettings(s);
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
