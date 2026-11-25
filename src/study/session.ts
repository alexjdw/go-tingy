/**
 * A spaced-repetition session: the due puzzles, one after another. A puzzle you didn't get cleanly comes back once
 * more at the end of the session. Pure logic; the screen just shows the current puzzle.
 */

/** How many puzzles one session holds. More can be started afterwards if more are due. */
export const SESSION_SIZE = 20;
/** How many times a puzzle you got wrong is shown again within the same session. */
export const MAX_RETRIES = 1;

export interface SessionResult {
  id: string;
  correct: boolean;
  /** true if this was the puzzle's first showing in the session */
  first: boolean;
  skipped?: boolean;
}

/** Fisher-Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The ids for the next session: the due puzzles in random order, at most `limit` of them. Puzzles in `first` (the
 * priority ones) come before all the others, each group in random order.
 */
export const pickSessionIds = (
  dueIds: readonly string[],
  rng: () => number = Math.random,
  limit = SESSION_SIZE,
  first: ReadonlySet<string> = new Set(),
) =>
  [
    ...shuffle(
      dueIds.filter((id) => first.has(id)),
      rng,
    ),
    ...shuffle(
      dueIds.filter((id) => !first.has(id)),
      rng,
    ),
  ].slice(0, limit);

export class SessionQueue {
  private items: string[];
  private index = 0;
  private retries = new Map<string, number>();
  readonly results: SessionResult[] = [];
  /** Ids already shown once, so a retry can be told from a first showing. */
  private seen = new Set<string>();
  /** The result of the puzzle on screen, once it has been solved or skipped. */
  private answered = false;

  constructor(ids: readonly string[]) {
    this.items = [...ids];
  }

  /** The puzzle to show now, or null when the session is over. */
  get current(): string | null {
    return this.items[this.index] ?? null;
  }

  get done() {
    return this.current === null;
  }

  /** 1-based position of the current puzzle. */
  get position() {
    return Math.min(this.index + 1, this.items.length);
  }

  /** How many showings the session has (grows when a puzzle comes back for a retry). */
  get total() {
    return this.items.length;
  }

  /** Has the current puzzle been answered (so that "Next" can be offered)? */
  get isAnswered() {
    return this.answered;
  }

  /** Record how the current puzzle went. A wrong one is queued again at the end, up to MAX_RETRIES times. */
  complete(correct: boolean) {
    const id = this.current;
    if (id === null || this.answered) return;
    this.answered = true;
    const first = !this.seen.has(id);
    this.seen.add(id);
    this.results.push({ id, correct, first });
    const used = this.retries.get(id) ?? 0;
    if (!correct && used < MAX_RETRIES) {
      this.retries.set(id, used + 1);
      this.items.push(id);
    }
  }

  /** Move on without recording anything (nothing is learned, nothing is scheduled). */
  skip() {
    const id = this.current;
    if (id === null) return;
    this.results.push({ id, correct: false, first: !this.seen.has(id), skipped: true });
    this.seen.add(id);
    this.answered = true;
  }

  /** Go to the next puzzle. */
  next() {
    if (this.current === null) return;
    this.index++;
    this.answered = false;
  }

  /** End the session now, keeping what has been recorded. */
  finish() {
    this.index = this.items.length;
    this.answered = false;
  }

  /** What happened, counting each puzzle once by its first showing. */
  stats() {
    const firsts = this.results.filter((r) => r.first && !r.skipped);
    return {
      reviewed: new Set(firsts.map((r) => r.id)).size,
      firstTry: firsts.filter((r) => r.correct).length,
      missed: firsts.filter((r) => !r.correct).length,
      skipped: this.results.filter((r) => r.skipped).length,
      retriesCleared: this.results.filter((r) => !r.first && r.correct && !r.skipped).length,
    };
  }
}
