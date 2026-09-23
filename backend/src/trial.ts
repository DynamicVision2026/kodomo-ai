import type { TrialDoc } from './schema.js';

/** AD-15/AD-16 §5: "account-first 72-hour family trial." */
export const TRIAL_DURATION_MS = 72 * 60 * 60 * 1000;

export function trialWindow(now: Date): { startedAt: string; endsAt: string } {
  return { startedAt: now.toISOString(), endsAt: new Date(now.getTime() + TRIAL_DURATION_MS).toISOString() };
}

/** AD-16 §5: "expired (derived from `endsAt`, never stored)." No trial doc at all means "not
 *  started" — never treated as expired; `POST /units/{unitId}/open` (backend/src/access.ts)
 *  starts it lazily on the trial unit's own first open. */
export type TrialState = 'not_started' | 'active' | 'expired';

export function trialState(trial: TrialDoc | null, now: Date = new Date()): TrialState {
  if (!trial) return 'not_started';
  return now.getTime() < new Date(trial.endsAt).getTime() ? 'active' : 'expired';
}
