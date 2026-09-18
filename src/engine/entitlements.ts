import type { AppState } from './storage';

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

/** Applies a successful /play/unlock redemption to app state — grants `${moduleId}:full` for
 *  every module the code unlocked, and raises the founder badge if the code carried one. Pure:
 *  the caller still owns calling save(). Never removes an entitlement or badge the family
 *  already had. */
export function applyRedemption(
  state: AppState,
  redeemed: { moduleIds: string[]; founder: boolean },
): AppState {
  const entitlements = new Set(state.entitlements);
  for (const moduleId of redeemed.moduleIds) entitlements.add(`${moduleId}:full`);
  return {
    ...state,
    entitlements: [...entitlements],
    founder: state.founder || redeemed.founder,
  };
}
