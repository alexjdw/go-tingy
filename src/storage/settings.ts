import AsyncStorage from '@react-native-async-storage/async-storage';

export type Tri = 'on' | 'off' | 'random';

export interface Settings {
  /** Unguided only: replay to a branching point and have the user mark all good moves first. */
  markChoices: Tri;
  /** Guided/unguided: swap black and white. */
  flipColors: Tri;
}

export const DEFAULT_SETTINGS: Settings = { markChoices: 'off', flipColors: 'random' };

const KEY = 'settings.v1';

export async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const saveSettings = (s: Settings) => AsyncStorage.setItem(KEY, JSON.stringify(s));
