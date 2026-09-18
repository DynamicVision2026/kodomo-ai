/**
 * Household licence. Spec v0.5 §9: one purchase covers every child and adult in the family.
 * Test build: only free missions unlock. Full build: a family code redeemed at /play/unlock
 * sets the module entitlement. No account, no email, no PII in the app.
 */
export function hasAccess(
  entitlements: string[],
  moduleId: string,
  missionId: string,
  freeMissionIds: string[],
): boolean {
  if (freeMissionIds.includes(missionId)) return true;
  return entitlements.includes(`${moduleId}:full`);
}
