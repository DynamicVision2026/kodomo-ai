import { describe, it, expect } from 'vitest';
import { hasAccess } from '../src/engine/entitlements';

/**
 * AD-13: entitlement is server-authoritative now — `hasAccess` is a pure predicate over whatever
 * `AppState.cachedEntitlements` currently holds, and that array is written ONLY by a real `/me`
 * response (src/family/session.ts). There is no local-authority redemption/reconciliation layer
 * left to test here; that security property (a hand-edited cache is corrected on the next real
 * `/me`, never trusted indefinitely) is exercised end to end in tests/EntitlementSecurity.test.tsx.
 */
describe('hasAccess', () => {
  it('always allows a free mission, regardless of entitlements', () => {
    expect(hasAccess([], 'm1', 'm1-s2-1-1', ['m1-s2-1-1'])).toBe(true);
  });

  it('denies a non-free mission without the module entitlement', () => {
    expect(hasAccess([], 'm1', 'm1-s2-1-2', ['m1-s2-1-1'])).toBe(false);
  });

  it('allows a non-free mission once the module is entitled', () => {
    expect(hasAccess(['m1'], 'm1', 'm1-s2-1-2', ['m1-s2-1-1'])).toBe(true);
  });

  it('an m1 entitlement never grants access to a different module', () => {
    expect(hasAccess(['m1'], 'm2', 'm2-s2-1-1', [])).toBe(false);
  });
});
