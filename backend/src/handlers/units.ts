import type { Env } from '../types.js';
import type { ProfileDoc } from '../schema.js';
import { profilePath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { checkUnitAccess, ensureTrialStarted, recordFirstPaidUse, recordTrialUnitOpened } from '../access.js';
import { isFreeMission } from '../../../shared/freeMissions.js';
import { isModuleEntitled } from '../family.js';
import { isBeginnerLaunchEnabled } from '../course.js';

/** The Playground's own module id — see backend/src/access.ts's own identical constant. */
const PLAYGROUND_MODULE_ID = 'm1';

async function ownsProfile(env: Env, familyId: string, profileId: string): Promise<boolean> {
  const profile = await env.db.get<ProfileDoc>(profilePath(familyId, profileId));
  return !!profile && !profile.deletedAt;
}

/**
 * POST /api/v1/units/{unitId}/open — AD-16 §6: the one endpoint every lesson entry calls, and
 * the ONLY place a module's trial clock ever starts (never login/account creation — AD-16 §0).
 * Replaces AD-15's implicit "trial starts at account-first login" behavior. `unitId` is a
 * mission id; `moduleId` is required in the body (not in AD-16's own literal endpoint sketch,
 * which only shows `{profileId}` — but resolving which module's trial/entitlement applies is
 * impossible without it once a second module exists, so this is a deliberate, documented gap-fill,
 * not a silent deviation).
 */
export async function handleUnitOpen(request: Request, env: Env, unitId: string): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });
  const familyId = resolved.session.familyId;

  let body: { profileId?: unknown; moduleId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.profileId !== 'string' || typeof body.moduleId !== 'string') {
    return new Response('profileId and moduleId are required', { status: 400 });
  }
  const { profileId, moduleId } = body as { profileId: string; moduleId: string };
  if (!(await ownsProfile(env, familyId, profileId))) return new Response('not found', { status: 404 });

  const now = new Date();
  const access = await checkUnitAccess(env, familyId, moduleId, unitId, now);
  if (!access.allowed) {
    return new Response(JSON.stringify({ error: access.reason }), { status: 403, headers: { 'content-type': 'application/json' } });
  }

  // WO-C5 §6/follow-up: the Playground's own trial clock is retired ONLY once BEGINNER_LAUNCH is
  // actually on for this family (`checkUnitAccess` above gates entry the same way) — while it's
  // off, every live family gets the exact pre-WO-C5 trial-start/record behavior, unchanged.
  if (moduleId === PLAYGROUND_MODULE_ID && (await isBeginnerLaunchEnabled(env, familyId))) {
    // The refund-eligibility evidence this used to record only in the pre-WO-C5 `else` branch
    // (`recordFirstPaidUse`, read by backend/src/refund.ts's `computeEligibilitySnapshot`) keeps
    // its exact old meaning — "an ENTITLED family used a non-free unit" — by checking entitlement
    // explicitly here, since access no longer implies it once the Playground is free. A family
    // with no entitlement at all (freely browsing the now-open Playground) never had anything
    // paid to record in the first place.
    if (!isFreeMission(moduleId, unitId) && (await isModuleEntitled(env, familyId, moduleId))) {
      await recordFirstPaidUse(env, familyId, moduleId, unitId, profileId, now);
    }
  } else if (isFreeMission(moduleId, unitId)) {
    await ensureTrialStarted(env, familyId, moduleId, now);
    // AD-15's own 2-hour-grace rule (backend/src/access.ts) — stamp every successful open of
    // the trial unit, not just the first, so a lesson genuinely underway right at the 72-hour
    // boundary can still be finished.
    await recordTrialUnitOpened(env, familyId, moduleId, now);
  } else {
    await recordFirstPaidUse(env, familyId, moduleId, unitId, profileId, now);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}
