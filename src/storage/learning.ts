import {
  type LearningBackup,
  type LearningState,
  chooseStartupState,
  parseBackups,
  pushBackup,
} from '../progress/learning';

/** The little bit of AsyncStorage the store needs; tests pass an in-memory one. */
export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const STATE_KEY = 'learning.v1';
export const BACKUPS_KEY = 'learning.backups.v1';

const readJson = async (kv: KeyValue, key: string): Promise<unknown> => {
  try {
    const raw = await kv.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined; // unreadable or damaged: treated as missing
  }
};

/**
 * Persistence for the learning state, with rolling backups.
 *  - save: write the current state (call on every change)
 *  - backup: snapshot the state into the backup list, keeping the most recent 15 (call when leaving a run)
 *  - load: at app start; the saved state, or the newest usable backup if it's missing or damaged
 */
export function createLearningStore(kv: KeyValue, now: () => number = Date.now) {
  const backups = async (): Promise<LearningBackup[]> => parseBackups(await readJson(kv, BACKUPS_KEY));
  return {
    backups,
    async load() {
      return chooseStartupState(await readJson(kv, STATE_KEY), await backups());
    },
    async save(state: LearningState) {
      await kv.setItem(STATE_KEY, JSON.stringify(state));
    },
    async backup(state: LearningState) {
      await kv.setItem(BACKUPS_KEY, JSON.stringify(pushBackup(await backups(), state, now())));
    },
  };
}
