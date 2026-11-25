import AsyncStorage from '@react-native-async-storage/async-storage';

export type Tri = 'on' | 'off' | 'random';

export interface Settings {
  /** Unguided only: replay to a branching point and have the user mark all good moves first. */
  markChoices: Tri;
  /** Guided/unguided: swap black and white. */
  flipColors: Tri;
  /** Solving only: show the puzzle as a still diagram, solve it in your head, then rate how it went. */
  paper: Tri;
  /** Backlog: how many puzzles to choose to work on first (see src/progress/backlog.ts). */
  backlogCount: number;
  /** Backlog: how many days those puzzles stay a priority. */
  backlogDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  markChoices: 'off',
  flipColors: 'random',
  paper: 'off',
  backlogCount: 5,
  backlogDays: 7,
};

const KEY = 'settings.v1';

export async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const saveSettings = (s: Settings) => AsyncStorage.setItem(KEY, JSON.stringify(s));
