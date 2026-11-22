/**
 * The stats a tile shows when you hover over it or long-press it: where the puzzle stands in every mode.
 * Pure: it builds lines of text from the saved state.
 */
import {
  DAILY_LIMIT,
  type MasteryState,
  attemptsLeft,
  guidedStages,
  guidedStatus,
  inCategory,
  puzzleMasteryLevel,
} from './mastery';
import { type Attempt, REVIEW_DAYS, computeSkill } from './skill';

export interface StatRow {
  label: string;
  value: string;
}

export interface StatSection {
  title: string;
  rows: StatRow[];
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const MASTERY_NAMES = { none: 'No level yet', green: 'Green', gold: 'Gold', diamond: 'Diamond' } as const;

/** "now", or how long until the puzzle is due again. */
export function dueText(history: Attempt[] | undefined, now = Date.now()): string {
  if (!history?.length) return 'Not started';
  const at = history[history.length - 1].at + REVIEW_DAYS[computeSkill(history).level] * 86_400_000;
  if (at <= now) return 'Due now';
  const days = Math.ceil((at - now) / 86_400_000);
  return days <= 1 ? 'Tomorrow' : `In ${days} days`;
}

export interface StatsInput {
  id: string;
  history: Attempt[] | undefined;
  mastery: MasteryState;
  /** how many moves the learner makes in the puzzle's longest line */
  learnerMoves: number;
  joseki: boolean;
  /** local day, e.g. "2026-11-22" */
  day: string;
  now?: number;
}

/** Spaced repetition, mastery and joseki, whether or not the puzzle is in them. */
export function tileStats(i: StatsInput): StatSection[] {
  const skill = computeSkill(i.history);

  const spaced: StatSection = { title: 'Spaced repetition', rows: [] };
  if (!inCategory(i.mastery, 'spaced', i.id)) spaced.rows.push({ label: 'Status', value: 'Not added' });
  else spaced.rows.push({ label: 'Status', value: 'In your reviews' });
  if (i.history?.length) {
    spaced.rows.push(
      { label: 'Level', value: cap(skill.level) },
      {
        label: 'Right first time',
        value: `${Math.round(skill.accuracy * 100)}% of ${skill.attempts === 1 ? '1 try' : `${skill.attempts} tries`}`,
      },
      { label: 'Next review', value: dueText(i.history, i.now) },
    );
  } else spaced.rows.push({ label: 'Reviews', value: 'None yet' });

  const mastery: StatSection = { title: 'Mastery', rows: [] };
  if (!inCategory(i.mastery, 'mastery', i.id)) mastery.rows.push({ label: 'Status', value: 'Not added' });
  else {
    const g = guidedStatus(i.mastery, i.id, i.learnerMoves);
    const stages = guidedStages(i.learnerMoves);
    const step = g.cleared ? stages.length : Math.max(0, stages.indexOf(g.free));
    const best = i.mastery.scores[i.id]?.best;
    mastery.rows.push(
      {
        label: 'Guided',
        value: g.cleared ? 'Cleared' : `Stage ${step + 1} of ${stages.length} (${plural(g.free, 'free move')})`,
      },
      {
        label: 'Best run',
        value: best ? `${best.score.toFixed(1)} · ${MASTERY_NAMES[puzzleMasteryLevel(i.mastery, i.id)]}` : 'None yet',
      },
      { label: 'Runs', value: String(i.mastery.scores[i.id]?.runs ?? 0) },
      { label: 'Today', value: `${attemptsLeft(i.mastery, i.id, i.day)} of ${DAILY_LIMIT} attempts left` },
    );
  }

  const joseki: StatSection = { title: 'Joseki mode', rows: [{ label: 'Both sides', value: i.joseki ? 'On' : 'Off' }] };
  return [spaced, mastery, joseki];
}
