import { describe, it, expect } from 'vitest';
import { hasAccess, applyRedemption, reconcileEntitlements, revokeUnrecognizedCode } from '../src/engine/entitlements';
import type { AppState } from '../src/engine/storage';

describe('hasAccess', () => {
  it('always allows a free mission, regardless of entitlements', () => {
    expect(hasAccess([], 'm1', 'm1-s2-1-1', ['m1-s2-1-1'])).toBe(true);
  });

  it('denies a non-free mission without the module entitlement', () => {
    expect(hasAccess([], 'm1', 'm1-s2-1-2', ['m1-s2-1-1'])).toBe(false);
  });

  it('allows a non-free mission once the module is entitled', () => {
    expect(hasAccess(['m1:full'], 'm1', 'm1-s2-1-2', ['m1-s2-1-1'])).toBe(true);
  });

  it('an m1 entitlement never grants access to a different module', () => {
    expect(hasAccess(['m1:full'], 'm2', 'm2-s2-1-1', [])).toBe(false);
  });
});

function baseState(overrides: Partial<AppState> = {}): AppState {
  return {
    profiles: [],
    entitlements: ['m1:free'],
    redeemedCode: null,
    founder: false,
    abVariant: 'A',
    deviceId: 'device-1',
    ...overrides,
  };
}

describe('applyRedemption', () => {
  it('grants a full entitlement for every module id the code covered', () => {
    const next = applyRedemption(baseState(), 'NAZE-TEST-TEST', { moduleIds: ['m1'], founder: false });
    expect(next.entitlements).toContain('m1:full');
  });

  it('records the redeemed code itself — the credential reconcileEntitlements requires', () => {
    const next = applyRedemption(baseState(), 'NAZE-TEST-TEST', { moduleIds: ['m1'], founder: false });
    expect(next.redeemedCode).toBe('NAZE-TEST-TEST');
  });

  it('does not duplicate an entitlement the family already had', () => {
    const next = applyRedemption(baseState({ entitlements: ['m1:free', 'm1:full'] }), 'NAZE-TEST-TEST', {
      moduleIds: ['m1'],
      founder: false,
    });
    expect(next.entitlements.filter((e) => e === 'm1:full')).toHaveLength(1);
  });

  it('raises the founder badge but never lowers it', () => {
    const raised = applyRedemption(baseState(), 'NAZE-TEST-TEST', { moduleIds: ['m1'], founder: true });
    expect(raised.founder).toBe(true);

    const alreadyFounder = applyRedemption(baseState({ founder: true }), 'NAZE-TEST-TEST', { moduleIds: ['m1'], founder: false });
    expect(alreadyFounder.founder).toBe(true);
  });

  it('leaves every other field untouched', () => {
    const state = baseState({ profiles: [{ id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2, progress: {} }] });
    const next = applyRedemption(state, 'NAZE-TEST-TEST', { moduleIds: ['m1'], founder: false });
    expect(next.profiles).toBe(state.profiles);
    expect(next.deviceId).toBe(state.deviceId);
    expect(next.abVariant).toBe(state.abVariant);
  });
});

/**
 * WO-30 §0: reconcileEntitlements() is the actual security boundary — see its own doc comment
 * in src/engine/entitlements.ts. These tests exist to directly prove the one property WO-30's
 * own "FORGED CLIENT" test category requires: a `:full` tag with no redeemedCode behind it is
 * never trusted, full stop, with no network round trip needed to know that.
 */
describe('reconcileEntitlements', () => {
  it('trusts entitlements as-is when a redeemedCode is present — the real-purchase shape applyRedemption writes', () => {
    const state = baseState({ entitlements: ['m1:free', 'm1:full'], redeemedCode: 'NAZE-REAL-CODE' });
    expect(reconcileEntitlements(state)).toEqual(['m1:free', 'm1:full']);
  });

  it('strips every :full tag when no redeemedCode is present — the direct-forgery case ("editing browser storage")', () => {
    const state = baseState({ entitlements: ['m1:free', 'm1:full'], redeemedCode: null });
    expect(reconcileEntitlements(state)).toEqual(['m1:free']);
  });

  it('strips a :full tag for every module, not just m1, with no code present', () => {
    const state = baseState({ entitlements: ['m1:full', 'm2:full', 'm1:free'], redeemedCode: null });
    expect(reconcileEntitlements(state)).toEqual(['m1:free']);
  });

  it('a bare non-empty redeemedCode string is enough to trust the cache, however implausible — real revocation is revokeUnrecognizedCode\'s job, not this function\'s', () => {
    const state = baseState({ entitlements: ['m1:full'], redeemedCode: 'NAZE-XXXX-XXXX' });
    expect(reconcileEntitlements(state)).toEqual(['m1:full']);
  });
});

describe('revokeUnrecognizedCode', () => {
  it('strips every :full tag and clears redeemedCode', () => {
    const state = baseState({ entitlements: ['m1:free', 'm1:full'], redeemedCode: 'NAZE-FAKE-FAKE' });
    const next = revokeUnrecognizedCode(state);
    expect(next.entitlements).toEqual(['m1:free']);
    expect(next.redeemedCode).toBeNull();
  });

  it('never touches the founder badge', () => {
    const state = baseState({ entitlements: ['m1:full'], redeemedCode: 'NAZE-FAKE-FAKE', founder: true });
    expect(revokeUnrecognizedCode(state).founder).toBe(true);
  });
});
