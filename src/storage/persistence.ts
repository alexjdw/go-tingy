import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Problem } from '../data/samples';
import type { ProgressMap } from '../progress/skill';

const LIB = 'library.v1';
const PROG = 'progress.v1';

export async function loadLibrary(): Promise<Problem[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(LIB)) ?? '[]');
  } catch {
    return [];
  }
}

export const saveLibrary = (items: Problem[]) => AsyncStorage.setItem(LIB, JSON.stringify(items));

export async function loadProgress(): Promise<ProgressMap> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PROG)) ?? '{}');
  } catch {
    return {};
  }
}

export const saveProgress = (p: ProgressMap) => AsyncStorage.setItem(PROG, JSON.stringify(p));

const JOSEKI = 'joseki.v1';

/** Ids of the puzzles the player marked as joseki (played from both sides). */
export async function loadJoseki(): Promise<string[]> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(JOSEKI)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const saveJoseki = (ids: string[]) => AsyncStorage.setItem(JOSEKI, JSON.stringify(ids));

const SEEN = 'seen.v1';

/** Names of the one-time tutorials the player has finished or dismissed. */
export async function loadSeen(): Promise<string[]> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(SEEN)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const saveSeen = (names: string[]) => AsyncStorage.setItem(SEEN, JSON.stringify(names));
