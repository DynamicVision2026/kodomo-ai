import type { AppState } from './storage';

/**
 * Household licence. Spec v0.5 §9: one purchase covers every child and adult in the family.
 * Test build: only free missions unlock. Full build: a family code redeemed at /play/unlock
 * sets the module entitlement. No account, no email, no PII in the app.
 *
 * Pure and synchronous by design (called from render, not just event handlers) — callers pass
 * an already-RECONCILED array (reconcileEntitlements(state) below), never state.entitlements
 * directly. hasAccess() itself has no way to tell a reconciled array from a raw one, so getting
 * that right is the caller's job; MissionShell.tsx is the one real production caller and does.
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

/**
 * WO-30 §0: the array hasAccess() may actually be trusted with. `state.entitlements` is a
 * plain localStorage field — indistinguishable, once written, from something a family typed
 * into devtools. The one thing a forger can't fabricate is a code the backend itself recognizes
 * (backend/src/handlers/unlock.ts), so a `${moduleId}:full` tag is only ever honored here
 * alongside a `redeemedCode` — no code on this device means every `:full` tag is stripped,
 * synchronously, no network round trip needed for that negative case. `'m1:free'` and any other
 * non-`:full` entry pass through unchanged (never anything to forge access with in the first
 * place — hasAccess() only ever checks for a `:full` tag).
 *
 * This is a real gate, not obscurity: even a devtools user who ALSO fabricates a plausible-
 * looking `redeemedCode` only gets a window until the next app boot, when MissionShell's own
 * background re-verification (src/shell/MissionShell.tsx) calls the SAME backend the code would
 * have to have come from — a made-up code gets an honest 404 and is cleared.
 */
export function reconcileEntitlements(state: Pick<AppState, 'entitlements' | 'redeemedCode'>): string[] {
  if (state.redeemedCode) return state.entitlements;
  return state.entitlements.filter((e) => !e.endsWith(':full'));
}

/** Applies a successful /play/unlock redemption to app state — grants `${moduleId}:full` for
 *  every module the code unlocked, records the code itself (the credential reconcileEntitlements
 *  and MissionShell's own re-verification both need), and raises the founder badge if the code
 *  carried one. Pure: the caller still owns calling save(). Never removes an entitlement or
 *  badge the family already had. */
export function applyRedemption(
  state: AppState,
  code: string,
  redeemed: { moduleIds: string[]; founder: boolean },
): AppState {
  const entitlements = new Set(state.entitlements);
  for (const moduleId of redeemed.moduleIds) entitlements.add(`${moduleId}:full`);
  return {
    ...state,
    entitlements: [...entitlements],
    redeemedCode: code,
    founder: state.founder || redeemed.founder,
  };
}

/**
 * WO-30: revokes a `redeemedCode` the backend no longer recognizes (an explicit `not_found` on
 * re-verification — see MissionShell's boot-time refresh) — this is what actually closes the
 * "fabricate a code AND a matching cached entitlement" gap: the fabricated code will never be a
 * real backend record, so the very next boot's re-verification clears it. Strips every `:full`
 * tag (the same ones reconcileEntitlements would have stripped had no code ever been stored) and
 * clears the code itself; never touches `founder` — a `not_found` on the ENTITLEMENT code says
 * nothing about a founder badge raised through a different, still-valid path. */
export function revokeUnrecognizedCode(state: AppState): AppState {
  return {
    ...state,
    entitlements: state.entitlements.filter((e) => !e.endsWith(':full')),
    redeemedCode: null,
  };
}
