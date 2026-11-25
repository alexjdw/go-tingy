import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type KataGoBridge, type KataGoStatus, bridgeAnalyzer, getBridge } from '../analysis/bridge';
import type { Suggestion } from '../analysis/suggest';

export type EngineState =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; moves: Suggestion[] } | { kind: 'error'; message: string };

interface Held {
  keys: unknown[];
  state: EngineState;
}

const sameKeys = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Ask the desktop app's KataGo about a position. `keys` identify the position being looked at: when they change,
 * what was shown is dropped (an answer for another position is never shown), and an answer still on its way for
 * an old position is ignored. `bridge` is null where there is no engine (a browser, a phone).
 */
export function useEngine(keys: unknown[]) {
  const bridge: KataGoBridge | null = useMemo(() => getBridge(), []);
  const analyzer = useMemo(() => (bridge ? bridgeAnalyzer(bridge) : null), [bridge]);
  const [status, setStatus] = useState<KataGoStatus | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const latest = useRef(0);

  // Asked again (`recheck`) after the player has set KataGo up.
  const [checks, setChecks] = useState(0);
  const recheck = useCallback(() => setChecks((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    if (bridge) {
      bridge
        .status()
        .then((s) => live && setStatus(s))
        .catch((e: unknown) => live && setStatus({ ready: false, message: String(e) }));
    }
    return () => {
      live = false;
    };
  }, [bridge, checks]);

  const ask = useCallback(
    async (job: (analyze: ReturnType<typeof bridgeAnalyzer>) => Promise<Suggestion[]>) => {
      if (!bridge) return;
      const id = ++latest.current;
      const mine = (state: EngineState) => id === latest.current && setHeld({ keys, state });
      mine({ kind: 'busy' });
      try {
        mine({ kind: 'done', moves: await job(bridgeAnalyzer(bridge)) });
      } catch (e) {
        mine({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    },
    [bridge, keys],
  );

  const state: EngineState = held && sameKeys(held.keys, keys) ? held.state : { kind: 'idle' };
  const openFolder = useCallback(() => void bridge?.openFolder?.(), [bridge]);
  return { available: bridge !== null, status, state, ask, analyzer, recheck, openFolder };
}
