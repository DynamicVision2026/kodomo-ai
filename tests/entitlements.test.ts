import { describe, it, expect } from 'vitest';
import { hasAccess, applyRedemption } from '../src/engine/entitlements';
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
    founder: false,
    abVariant: 'A',
    deviceId: 'device-1',
    ...overrides,
  };
}

describe('applyRedemption', () => {
  it('grants a full entitlement for every module id the code covered', () => {
    const next = applyRedemption(baseState(), { moduleIds: ['m1'], founder: false });
    expect(next.entitlements).toContain('m1:full');
  });

  it('does not duplicate an entitlement the family already had', () => {
    const next = applyRedemption(baseState({ entitlements: ['m1:free', 'm1:full'] }), {
      moduleIds: ['m1'],
      founder: false,
    });
    expect(next.entitlements.filter((e) => e === 'm1:full')).toHaveLength(1);
  });

  it('raises the founder badge but never lowers it', () => {
    const raised = applyRedemption(baseState(), { moduleIds: ['m1'], founder: true });
    expect(raised.founder).toBe(true);

    const alreadyFounder = applyRedemption(baseState({ founder: true }), { moduleIds: ['m1'], founder: false });
    expect(alreadyFounder.founder).toBe(true);
  });

  it('leaves every other field untouched', () => {
    const state = baseState({ profiles: [{ id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2, progress: {} }] });
    const next = applyRedemption(state, { moduleIds: ['m1'], founder: false });
    expect(next.profiles).toBe(state.profiles);
    expect(next.deviceId).toBe(state.deviceId);
    expect(next.abVariant).toBe(state.abVariant);
  });
});
