/**
 * Puzzle tiles are drawn in batches: the first BATCH_SIZE, then BATCH_SIZE more each time the player scrolls
 * near the end (or taps "Show more"). A library of hundreds of puzzles never draws hundreds of boards at once.
 */
export const BATCH_SIZE = 10;

/** How many tiles to show after loading another batch. Never more than there are. */
export const nextCount = (shown: number, total: number, batch = BATCH_SIZE) =>
  Math.min(Math.max(total, 0), Math.max(shown, 0) + batch);

/** How many tiles are visible right now (a batch may be bigger than what is left, or the list may have shrunk). */
export const visibleCount = (shown: number, total: number) => Math.min(Math.max(shown, 0), Math.max(total, 0));

/** How many tiles are still waiting. */
export const remaining = (shown: number, total: number) => Math.max(0, total - visibleCount(shown, total));

/** The label for the load-more button: "Show 10 more", or fewer when fewer are left. */
export const moreLabel = (left: number, batch = BATCH_SIZE) => `Show ${Math.min(batch, left)} more`;
