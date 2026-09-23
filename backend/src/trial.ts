import type { TrialDoc } from './schema.js';

/** AD-15/AD-16 §5: "account-first 72-hour family trial." */
export const TRIAL_DURATION_MS = 72 * 60 * 60 * 1000;

/** AD-15's own approved rule: "expired trial: new 1-1 start blocked; existing in-progress lesson
 *  retains the approved 2-hour grace." `checkUnitAccess` (backend/src/access.ts) is the only
 *  reader — never extends the trial itself (`endsAt` stays exactly where it was), just tolerates
 *  entry a little past it for a family that had the trial unit open recently (`TrialDoc.
 *  lastOpenedAt`), never a brand-new open with no recent open at all. */
export const TRIAL_GRACE_MS = 2 * 60 * 60 * 1000;

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
