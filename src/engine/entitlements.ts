/**
 * AD-13 §1: "the backend owns identity" — entitlement is server-authoritative, full stop. There
 * is no local-authority fallback left to reconcile: `state.cachedEntitlements` (src/engine/
 * storage.ts) is written ONLY by src/family/session.ts, and only ever from an actual `/me`
 * response body — never constructed, merged, or defaulted-into by anything a family could reach
 * from devtools. That single write path (not a client-side forgery check, unlike the old
 * `reconcileEntitlements`/`redeemedCode` pairing this replaces) is the whole security boundary
 * now: a hand-edited `cachedEntitlements` array survives only until the next successful `/me`
 * call overwrites it wholesale, which MissionShell already triggers on every boot (same
 * once-per-app-open cadence the old redemption re-verification used).
 */
export function hasAccess(
  entitlements: string[],
  moduleId: string,
  missionId: string,
  freeMissionIds: string[],
): boolean {
  if (freeMissionIds.includes(missionId)) return true;
  return entitlements.includes(moduleId);
}
