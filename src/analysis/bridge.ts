import type { Analysis, Analyzer, Query } from './engine';
import { fromResponse, toRequest } from './katago';

/**
 * What the desktop app's shell offers the page for talking to KataGo (see desktop/preload.js). The shell only
 * passes JSON lines to the engine and back; building the queries and reading the answers is done here, so this code is
 * the same wherever the engine runs.
 */
export interface KataGoStatus {
  /** is an engine configured? (Whether it starts is only known when it is asked something.) */
  ready: boolean;
  /** what is wrong, if not ready */
  message: string;
  /** where this app runs and where KataGo goes, for the setup help */
  setup?: { platform: string; arch: string; folder: string };
}

export interface KataGoBridge {
  status(): Promise<KataGoStatus>;
  /** open the folder KataGo goes in, creating it first */
  openFolder?(): Promise<void>;
  /** send one analysis request (a JSON object) and get the answer (a JSON object), both as text */
  query(request: string): Promise<string>;
}

/** The bridge the shell put on the page, or null in a browser or on a phone. */
export function getBridge(scope: object = globalThis): KataGoBridge | null {
  const b = (scope as { katago?: KataGoBridge }).katago;
  return b && typeof b.query === 'function' && typeof b.status === 'function' ? b : null;
}

export function bridgeAnalyzer(bridge: KataGoBridge): Analyzer {
  return {
    async analyze(query: Query): Promise<Analysis> {
      const text = await bridge.query(JSON.stringify(toRequest('0', query)));
      return fromResponse(JSON.parse(text));
    },
  };
}
