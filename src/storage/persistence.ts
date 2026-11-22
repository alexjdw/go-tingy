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
