import type { Env } from './types.js';
import type { TrialDoc, UsageDoc } from './schema.js';
import { trialPath, usagePath } from './schema.js';
import { isModuleEntitled } from './family.js';
import { isPlaygroundSectionLocked } from './playground.js';
import { trialState, TRIAL_GRACE_MS } from './trial.js';

/** The Playground's own module id (`src/modules/m1/module.json`'s `id`) — the one moduleId
 *  `checkUnitAccess` ever special-cases into free entry (WO-C5 §6). */
const PLAYGROUND_MODULE_ID = 'm1';

export type AccessRefusalReason = 'trial_expired' | 'not_entitled';
export type AccessResult = { allowed: true } | { allowed: false; reason: AccessRefusalReason };

/**
 * AD-16 §6's own "the AD-15 gate": whether `familyId` may open `unitId` (a mission id) inside
 * `moduleId` right now.
 *
 * WO-C5 §6 (retires the 72-hour account-first trial this function used to enforce): the Playground
 * (`moduleId === 'm1'`) is now free entry for every logged-in family, gated only by
 * `config/playground.lockedSections` (backend/src/playground.ts) — empty by default, so this
 * unconditionally passes today; a section id added there later is the one hook for locking part of
 * it again. Entitlement no longer matters for Playground ACCESS at all — the `kodomo-ai-m1`
 * entitlement's own meaning going forward is "unlocks the 入門コース" (see
 * backend/src/course.ts's sibling course-progress handler), not "unlocks the Playground." Any
 * OTHER module (none exist yet) keeps the plain entitled-or-refused check, unchanged.
 *
 * `TrialDoc`/`trial.ts`'s own start/expiry machinery is dead code from this function's point of
 * view now — a family's pre-existing trial doc, if any, is simply never read here again. AD-15's
 * progress-write 2-hour grace (`isProgressWriteAllowed` below) is a SEPARATE operation the WO left
 * untouched (progress saves, not unit opens) and still reads it exactly as before.
 */
export async function checkUnitAccess(
  env: Env,
  familyId: string,
  moduleId: string,
  unitId: string,
): Promise<AccessResult> {
  if (moduleId === PLAYGROUND_MODULE_ID) {
    if (await isPlaygroundSectionLocked(env, unitId)) return { allowed: false, reason: 'not_entitled' };
    return { allowed: true };
  }
  if (await isModuleEntitled(env, familyId, moduleId)) return { allowed: true };
  return { allowed: false, reason: 'not_entitled' };
}

/**
 * AD-15's own 2-hour-grace rule, precisely scoped: "only progress writes for a lesson opened
 * before `endsAt` are accepted until `endsAt` + 2 hours" — never a re-open of the unit itself.
 * WO-C5 §6 left this operation (a progress SAVE, not a unit open) untouched on purpose: a family
 * with a trial doc from before the Playground went free still reads exactly the same here as it
 * always did. Since nothing starts a NEW trial doc any more (`checkUnitAccess` above no longer
 * gates Playground access on one at all), this simply never fires for any family whose first
 * Playground open happens after WO-C5 — `trial` is `null`, `trialState` returns `not_started`, and
 * this returns `true` unconditionally, the same as it always has for a family with no trial history.
 */
export async function isProgressWriteAllowed(env: Env, familyId: string, moduleId: string, now: Date = new Date()): Promise<boolean> {
  const trial = await env.db.get<TrialDoc>(trialPath(familyId, moduleId));
  const state = trialState(trial, now);
  if (state !== 'expired') return true; // not_started/active — same as before this rule existed.
  if (!trial?.lastOpenedAt) return false; // never actually opened — nothing to extend grace to.
  return now.getTime() - new Date(trial.endsAt).getTime() <= TRIAL_GRACE_MS;
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
