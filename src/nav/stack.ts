/**
 * A tiny navigation stack. The app shows the last entry; going back pops it. Keeping this as plain functions
 * makes the back behavior (including the Android back button) testable.
 */
export type Stack<T> = readonly T[];

export const current = <T>(s: Stack<T>): T => s[s.length - 1];

/** Open a screen on top of the current one. */
export const push = <T>(s: Stack<T>, screen: T): Stack<T> => [...s, screen];

/** Replace the current screen. */
export const replace = <T>(s: Stack<T>, screen: T): Stack<T> => [...s.slice(0, -1), screen];

/** Go back one screen. The first screen stays: there is nowhere to go back to. */
export const pop = <T>(s: Stack<T>): Stack<T> => (s.length > 1 ? s.slice(0, -1) : s);

/** Go back `n` screens (at least one stays). */
export const popN = <T>(s: Stack<T>, n: number): Stack<T> => s.slice(0, Math.max(1, s.length - n));

/** Start over from one screen. */
export const reset = <T>(screen: T): Stack<T> => [screen];

export const canGoBack = <T>(s: Stack<T>) => s.length > 1;
