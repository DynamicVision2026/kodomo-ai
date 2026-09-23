import { describe, it, expect } from 'vitest';
import { emptyModuleProgress, mergeModuleProgress, type ModuleProgressState } from '../shared/progressMerge';

function state(overrides: Partial<ModuleProgressState> = {}): ModuleProgressState {
  return { ...emptyModuleProgress(), ...overrides };
}

describe('mergeModuleProgress — monotonic merge (AD-13 §2)', () => {
  it('missions: done is OR, stamps is max, coop is OR', () => {
    const a = state({ missions: { m1: { done: true, stamps: 2, coop: false } } });
    const b = state({ missions: { m1: { done: false, stamps: 5, coop: true } } });
    expect(mergeModuleProgress(a, b).missions.m1).toEqual({ done: true, stamps: 5, coop: true });
  });

  it('milestones: both achieved keeps the earliest achievedAt', () => {
    const a = state({ milestones: { M1: { achieved: true, achievedAt: 500 } } });
    const b = state({ milestones: { M1: { achieved: true, achievedAt: 100 } } });
    expect(mergeModuleProgress(a, b).milestones.M1).toEqual({ achieved: true, achievedAt: 100 });
  });

  it('milestones: only one side achieved wins outright, never re-derived', () => {
    const a = state({ milestones: { M1: { achieved: true, achievedAt: 100 } } });
    const b = state({ milestones: { M1: { achieved: false, achievedAt: null } } });
    expect(mergeModuleProgress(a, b).milestones.M1).toEqual({ achieved: true, achievedAt: 100 });
    expect(mergeModuleProgress(b, a).milestones.M1).toEqual({ achieved: true, achievedAt: 100 });
  });

  it('memories: dated, first-occurrence — keeps the earliest recordedAt, never duplicates a kind', () => {
    const a = state({ memories: { first_blind_commit: { kind: 'first_blind_commit', recordedAt: 900, missionId: 'm1' } } });
    const b = state({ memories: { first_blind_commit: { kind: 'first_blind_commit', recordedAt: 200, missionId: 'm2' } } });
    expect(mergeModuleProgress(a, b).memories.first_blind_commit).toEqual({ kind: 'first_blind_commit', recordedAt: 200, missionId: 'm2' });
  });

  it('m2Evidence.proxyMissionIds: union, distinct', () => {
    const a = state({ m2Evidence: { proxyMissionIds: ['m1', 'm2'] } });
    const b = state({ m2Evidence: { proxyMissionIds: ['m2', 'm3'] } });
    expect(new Set(mergeModuleProgress(a, b).m2Evidence.proxyMissionIds)).toEqual(new Set(['m1', 'm2', 'm3']));
  });

  it('moveProgress: rung is the higher scaffold rung, aptUseDomains is a union', () => {
    const a = state({ moveProgress: { follownaze: { rung: 'moratta', aptUseDomains: ['home'] } } });
    const b = state({ moveProgress: { follownaze: { rung: 'hitoride', aptUseDomains: ['school'] } } });
    const merged = mergeModuleProgress(a, b).moveProgress.follownaze;
    expect(merged?.rung).toBe('hitoride');
    expect(new Set(merged?.aptUseDomains)).toEqual(new Set(['home', 'school']));
  });

  it('guidance: max per verb, a guidance counter never goes backwards', () => {
    const a = state({ guidance: { yomu: 3, kaku: 1 } });
    const b = state({ guidance: { yomu: 1, kaku: 4 } });
    expect(mergeModuleProgress(a, b).guidance).toEqual({ yomu: 3, kaku: 4 });
  });

  it('is commutative: merge(a, b) equals merge(b, a)', () => {
    const a = state({ missions: { m1: { done: true, stamps: 2, coop: false } }, guidance: { yomu: 2 } });
    const b = state({ missions: { m1: { done: false, stamps: 9, coop: true } }, guidance: { yomu: 5 } });
    expect(mergeModuleProgress(a, b)).toEqual(mergeModuleProgress(b, a));
  });

  it('is idempotent: merging a state with itself changes nothing — a re-sent/duplicated flush never corrupts progress', () => {
    const a = state({
      missions: { m1: { done: true, stamps: 3, coop: true } },
      moveProgress: { follownaze: { rung: 'tsukaeru', aptUseDomains: ['home'] } },
      guidance: { yomu: 2 },
    });
    expect(mergeModuleProgress(a, a)).toEqual(a);
  });

  it('merging three times in any order (simulating two devices syncing repeatedly) never loses or duplicates an event', () => {
    const deviceA = state({ m2Evidence: { proxyMissionIds: ['m1'] }, guidance: { yomu: 1 } });
    const deviceB = state({ m2Evidence: { proxyMissionIds: ['m2'] }, guidance: { yomu: 3 } });
    const order1 = mergeModuleProgress(mergeModuleProgress(deviceA, deviceB), deviceA); // A syncs again
    const order2 = mergeModuleProgress(deviceB, mergeModuleProgress(deviceA, deviceA));
    expect(new Set(order1.m2Evidence.proxyMissionIds)).toEqual(new Set(['m1', 'm2']));
    // Semantically equal (same set/values), regardless of which order each union happened to
    // build its array in — `proxyMissionIds`' own element ORDER is never a promised property.
    expect(new Set(order1.m2Evidence.proxyMissionIds)).toEqual(new Set(order2.m2Evidence.proxyMissionIds));
    expect(order1.guidance).toEqual(order2.guidance);
    expect(order1.guidance.yomu).toBe(3);
  });
});
