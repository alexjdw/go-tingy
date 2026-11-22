import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValue } from './mastery';

/** AsyncStorage as a KeyValue (localStorage on web, native storage on devices). */
export const asyncKv: KeyValue = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
};
