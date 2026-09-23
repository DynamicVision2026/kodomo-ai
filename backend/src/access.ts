import type { Env } from './types.js';
import type { TrialDoc, UsageDoc } from './schema.js';
import { trialPath, usagePath } from './schema.js';
import { isModuleEntitled } from './family.js';
import { isFreeMission } from '../../shared/freeMissions.js';
import { trialState, trialWindow, TRIAL_GRACE_MS } from './trial.js';

export type AccessRefusalReason = 'trial_expired' | 'not_entitled';
export type AccessResult = { allowed: true } | { allowed: false; reason: AccessRefusalReason };

/**
 * AD-16 §6's own "the AD-15 gate": whether `familyId` may open `unitId` (a mission id) inside
 * `moduleId` right now. An actively entitled module always passes (also covers "refunded/revoked
 * M1: access falls back to the existing trial state/dates" — a revoked entitlement just makes
 * this check fall through to the SAME trial doc below, exactly as if it had never been entitled;
 * nothing here or in `ensureTrialStarted` ever resets/recreates a trial doc that already exists).
 * Otherwise, only the module's own free/trial unit(s) (shared/freeMissions.ts) can ever pass, and
 * only while that module's trial hasn't elapsed — `not_started` counts as passing (the caller
 * starts it via `ensureTrialStarted`), `expired` closes it, with NO exception here: AD-15's own
 * "expired trial: new 1-1 start blocked" is unconditional — a NEW open or a RE-open of 1-1 is
 * refused the instant `now` passes `endsAt`, whatever `TrialDoc.lastOpenedAt` says. The 2-hour
 * grace this module also implements applies to a DIFFERENT operation entirely — see
 * `isProgressWriteAllowed` below, used by `handlePutProgress`
 * (backend/src/handlers/progress.ts) to keep accepting progress SAVES for a lesson that was
 * already legitimately opened before `endsAt`, without ever re-opening (or re-entering) it. AD-16
 * §0: trial expiry is the only place any of this ever refuses anything — never login, `/me`,
 * profiles, or purchase.
 */
export async function checkUnitAccess(
  env: Env,
  familyId: string,
  moduleId: string,
  unitId: string,
  now: Date = new Date(),
): Promise<AccessResult> {
  if (await isModuleEntitled(env, familyId, moduleId)) return { allowed: true };
  if (!isFreeMission(moduleId, unitId)) return { allowed: false, reason: 'not_entitled' };

  const trial = await env.db.get<TrialDoc>(trialPath(familyId, moduleId));
  if (trialState(trial, now) === 'expired') return { allowed: false, reason: 'trial_expired' };
  return { allowed: true };
}

/**
 * AD-15's own 2-hour-grace rule, precisely scoped: "only progress writes for a lesson opened
 * before `endsAt` are accepted until `endsAt` + 2 hours" — never a re-open of the unit itself
 * (`checkUnitAccess` above has no exception for this at all). `TrialDoc.lastOpenedAt` is set only
 * by `recordTrialUnitOpened`, itself only ever called right after `checkUnitAccess` already
 * allowed the open — so by construction, a non-null `lastOpenedAt` can never be later than
 * `endsAt` (opening is unconditionally refused from `endsAt` onward), meaning "opened before
 * endsAt" reduces to "has ever been opened at all". The grace window itself is anchored at
 * `endsAt`, not at `lastOpenedAt` — a lesson opened at hour 71 gets the same cutoff (`endsAt` + 2h)
 * as one opened at hour 1, never a sliding/renewable window.
 */
export async function isProgressWriteAllowed(env: Env, familyId: string, moduleId: string, now: Date = new Date()): Promise<boolean> {
  const trial = await env.db.get<TrialDoc>(trialPath(familyId, moduleId));
  const state = trialState(trial, now);
  if (state !== 'expired') return true; // not_started/active — same as before this rule existed.
  if (!trial?.lastOpenedAt) return false; // never actually opened — nothing to extend grace to.
  return now.getTime() - new Date(trial.endsAt).getTime() <= TRIAL_GRACE_MS;
}

/** Idempotent, race-safe (transactional): the first call for a family+module actually starts the
 *  clock; every later call is a no-op returning the SAME doc (AD-16 §5: "not started -> active",
 *  never restarted — this is also what makes the "refunded/revoked: no new trial created" rule
 *  hold: a family with an existing trial doc from before their purchase/refund gets that SAME
 *  doc back, dates untouched). */
export async function ensureTrialStarted(env: Env, familyId: string, moduleId: string, now: Date = new Date()): Promise<TrialDoc> {
  const path = trialPath(familyId, moduleId);
  return env.db.runTransaction(async (tx) => {
    const existing = await tx.get<TrialDoc>(path);
    if (existing) return existing;
    const doc: TrialDoc = { ...trialWindow(now), convertedAt: null, convertedOrderId: null, lastOpenedAt: null };
    tx.set(path, doc);
    return doc;
  });
}

/** Stamps "the trial unit was just opened" on every server-accepted open of it (`checkUnitAccess`
 *  already having allowed it, so this only ever runs while the trial was still active or not yet
 *  started) — the ONE signal `isProgressWriteAllowed` above reads to grant its 2-hour progress-
 *  save grace. Always called together with `ensureTrialStarted` (backend/src/handlers/units.ts)
 *  so a trial doc always exists by the time this runs; a missing doc (shouldn't happen) is a
 *  silent no-op rather than fabricating one out of order. */
export async function recordTrialUnitOpened(env: Env, familyId: string, moduleId: string, now: Date = new Date()): Promise<void> {
  const path = trialPath(familyId, moduleId);
  await env.db.runTransaction(async (tx) => {
    const existing = await tx.get<TrialDoc>(path);
    if (!existing) return;
    tx.set(path, { ...existing, lastOpenedAt: now.toISOString() });
  });
}

/** AD-16 §6: "the first server-accepted open of any non-trial unit... if not already set." Never
 *  overwrites an existing record — first use is first use, permanently. */
export async function recordFirstPaidUse(
  env: Env,
  familyId: string,
  moduleId: string,
  unitId: string,
  profileId: string,
  now: Date = new Date(),
): Promise<void> {
  const path = usagePath(familyId, moduleId);
  await env.db.runTransaction(async (tx) => {
    const existing = await tx.get<UsageDoc>(path);
    if (existing) return;
    const doc: UsageDoc = { firstPaidUseAt: now.toISOString(), firstPaidUnitId: unitId, firstPaidProfileId: profileId };
    tx.set(path, doc);
  });
}
