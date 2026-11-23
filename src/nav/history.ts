/**
 * Browser history for the navigation stack (web). Each history entry stands for a stack depth, so the browser's
 * Back and Forward buttons move up and down the stack. Screens that were left by going back are kept to come
 * back to with Forward until something new is opened.
 */
import type { Stack } from './stack';

export interface Nav<T> {
  stack: Stack<T>;
  /** screens that Back left, nearest first */
  forward: readonly T[];
}

/** The browser moved to the history entry for `depth` screens: go back or forward to match (never past what exists). */
export function toDepth<T>(nav: Nav<T>, depth: number): Nav<T> {
  const want = Math.max(1, Math.floor(depth) || 1);
  const have = nav.stack.length;
  if (want < have) return { stack: nav.stack.slice(0, want), forward: [...nav.stack.slice(want), ...nav.forward] };
  if (want > have) {
    const n = Math.min(want - have, nav.forward.length);
    return { stack: [...nav.stack, ...nav.forward.slice(0, n)], forward: nav.forward.slice(n) };
  }
  return nav;
}

/** The depth stored in a history entry's state, 1 if there is none. */
export function depthOf(state: unknown): number {
  const d = (state as { depth?: unknown } | null)?.depth;
  return typeof d === 'number' && d >= 1 ? d : 1;
}
