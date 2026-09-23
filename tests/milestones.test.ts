import { describe, it, expect } from 'vitest';
import {
  evaluateM1, evaluateM3, evaluateM4, evaluateM5, applyM2Confirmed, applyM0Sealed,
  addM2ProxyMission, hasM2Proxy, recordFirstThreeChain, recordFirstBlindCommit, recordOutsideUse,
  type MilestoneMap, type M2Evidence, type MemoryMomentMap,
} from '../src/engine/milestones';
import { applyAptUse, applyOutsideUse, type MoveProgressMap } from '../src/engine/scaffold';

const NOW = 1_700_000_000_000;

describe('evaluateM1 (どうぐが 手に入った — derived from moveProgress)', () => {
  it('does not achieve M1 when no move has reached moratta or beyond', () => {
    const result = evaluateM1({}, {}, NOW);
    expect(result.M1).toBeUndefined();
  });

  it('achieves M1 once any move has reached moratta', () => {
    const moveProgress: MoveProgressMap = { 'follow-naze': { rung: 'moratta', aptUseDomains: [] } };
    const result = evaluateM1({}, moveProgress, NOW);
    expect(result.M1).toEqual({ achieved: true, achievedAt: NOW });
  });

  it('achieves M1 from a move already beyond moratta (tsukaeru/hitoride)', () => {
    let moveProgress: MoveProgressMap = {};
    for (const domain of ['日常', 'ことば', '社会とひと']) moveProgress = applyAptUse(moveProgress, 'follow-naze', domain);
    const result = evaluateM1({}, moveProgress, NOW);
    expect(result.M1?.achieved).toBe(true);
  });

  it('is idempotent: does not re-timestamp once already achieved', () => {
    const moveProgress: MoveProgressMap = { 'follow-naze': { rung: 'moratta', aptUseDomains: [] } };
    const achieved = evaluateM1({}, moveProgress, NOW);
    const later = evaluateM1(achieved, moveProgress, NOW + 1000);
    expect(later).toEqual(achieved);
    expect(later.M1?.achievedAt).toBe(NOW);
  });

  it('leaves other milestones untouched', () => {
    const milestones: MilestoneMap = { M4: { achieved: true, achievedAt: NOW - 1 } };
    const moveProgress: MoveProgressMap = { 'follow-naze': { rung: 'moratta', aptUseDomains: [] } };
    const result = evaluateM1(milestones, moveProgress, NOW);
    expect(result.M4).toEqual({ achieved: true, achievedAt: NOW - 1 });
    expect(result.M1?.achieved).toBe(true);
  });
});

describe('evaluateM3 (3れん ホリ — 3+ authored layer chain)', () => {
  it('does not achieve M3 for a phase with fewer than 3 layers', () => {
    expect(evaluateM3({}, 1, NOW).M3).toBeUndefined();
    expect(evaluateM3({}, 2, NOW).M3).toBeUndefined();
  });

  it('achieves M3 for a phase with exactly 3 layers', () => {
    const result = evaluateM3({}, 3, NOW);
    expect(result.M3).toEqual({ achieved: true, achievedAt: NOW });
  });

  it('achieves M3 for a phase with more than 3 layers', () => {
    expect(evaluateM3({}, 5, NOW).M3?.achieved).toBe(true);
  });

  it('is idempotent and monotonic once achieved', () => {
    const achieved = evaluateM3({}, 3, NOW);
    const later = evaluateM3(achieved, 3, NOW + 1000);
    expect(later).toEqual(achieved);
  });
});

describe('evaluateM4 (カードなしで きけた — first blind_commit)', () => {
  it('achieves M4 unconditionally on the first call', () => {
    const result = evaluateM4({}, NOW);
    expect(result.M4).toEqual({ achieved: true, achievedAt: NOW });
  });

  it('is idempotent: a second call does not re-timestamp', () => {
    const first = evaluateM4({}, NOW);
    const second = evaluateM4(first, NOW + 1000);
    expect(second).toEqual(first);
  });
});

describe('applyM2Confirmed (M2b — the actual milestone, wired to the parent screen\'s confirmation button since WO-14)', () => {
  it('achieves M2 when called directly', () => {
    const result = applyM2Confirmed({}, NOW);
    expect(result.M2).toEqual({ achieved: true, achievedAt: NOW });
  });

  it('is idempotent', () => {
    const first = applyM2Confirmed({}, NOW);
    expect(applyM2Confirmed(first, NOW + 1000)).toEqual(first);
  });

  // Builder work order §0: applyM2Confirmed no longer tracks afterCompare at all — the decision
  // of whether a confirmation is genuine (and therefore may call this function) is made entirely
  // by the caller (src/shell/MissionShell.tsx's confirmM2b), BEFORE this function is ever invoked.
  // An after-compare confirmation must never call this function — see tests/Audio.test.tsx and
  // tests/MissionShell.test.tsx for that caller-side behavior.
  it('never carries an afterCompare field on the milestone it produces — an achieved M2 is by definition unprimed', () => {
    const result = applyM2Confirmed({}, NOW);
    expect(result.M2).not.toHaveProperty('afterCompare');
  });

  it('leaves an already-achieved M2 completely untouched, same achievedAt, on a later call', () => {
    const first = applyM2Confirmed({}, NOW);
    const second = applyM2Confirmed(first, NOW + 1000);
    expect(second).toEqual(first); // unchanged — same achievedAt, never revoked or re-derived
  });
});

describe('applyM0Sealed (WO-19: M0, the Day-1 envelope moment)', () => {
  it('achieves M0 when called directly (the parent screen\'s "seal it" tap)', () => {
    const result = applyM0Sealed({}, NOW);
    expect(result.M0).toEqual({ achieved: true, achievedAt: NOW });
  });

  it('is idempotent', () => {
    const first = applyM0Sealed({}, NOW);
    expect(applyM0Sealed(first, NOW + 1000)).toEqual(first);
  });

  it('leaves other milestones untouched', () => {
    const milestones: MilestoneMap = { M1: { achieved: true, achievedAt: NOW - 1 } };
    const result = applyM0Sealed(milestones, NOW);
    expect(result.M1).toEqual({ achieved: true, achievedAt: NOW - 1 });
    expect(result.M0?.achieved).toBe(true);
  });
});

describe('evaluateM5 (そとで つかった — derived from moveProgress, mirrors evaluateM1)', () => {
  it('does not achieve M5 when no move has reached sotode', () => {
    const moveProgress: MoveProgressMap = { 'follow-naze': { rung: 'hitoride', aptUseDomains: [] } };
    expect(evaluateM5({}, moveProgress, NOW).M5).toBeUndefined();
  });

  it('achieves M5 once any move has reached sotode via applyOutsideUse', () => {
    const moveProgress = applyOutsideUse({}, 'follow-naze');
    const result = evaluateM5({}, moveProgress, NOW);
    expect(result.M5).toEqual({ achieved: true, achievedAt: NOW });
  });

  it('is idempotent: does not re-timestamp once already achieved', () => {
    const moveProgress = applyOutsideUse({}, 'follow-naze');
    const achieved = evaluateM5({}, moveProgress, NOW);
    const later = evaluateM5(achieved, moveProgress, NOW + 1000);
    expect(later).toEqual(achieved);
  });

  it('leaves M1-M4 untouched', () => {
    const milestones: MilestoneMap = {
      M1: { achieved: true, achievedAt: NOW - 3 },
      M4: { achieved: true, achievedAt: NOW - 1 },
    };
    const moveProgress = applyOutsideUse({}, 'follow-naze');
    const result = evaluateM5(milestones, moveProgress, NOW);
    expect(result.M1).toEqual({ achieved: true, achievedAt: NOW - 3 });
    expect(result.M4).toEqual({ achieved: true, achievedAt: NOW - 1 });
    expect(result.M5?.achieved).toBe(true);
  });
});

describe('recordOutsideUse (WO-19: shares its evidence with M5, first-occurrence only, not mission-scoped)', () => {
  it('records outside_use once', () => {
    const result = recordOutsideUse({}, NOW);
    expect(result.outside_use).toEqual({ kind: 'outside_use', recordedAt: NOW, missionId: undefined });
  });

  it('does not overwrite an already-recorded first occurrence', () => {
    const first = recordOutsideUse({}, NOW);
    const second = recordOutsideUse(first, NOW + 1000);
    expect(second).toEqual(first);
  });
});

describe('M2a system-proxy evidence (Critical M2 distinction — never awards M2 itself)', () => {
  it('starts empty and does not meet the proxy threshold', () => {
    const evidence: M2Evidence = { proxyMissionIds: [] };
    expect(hasM2Proxy(evidence)).toBe(false);
  });

  it('accumulates distinct mission ids', () => {
    let evidence: M2Evidence = { proxyMissionIds: [] };
    evidence = addM2ProxyMission(evidence, 'bread');
    expect(evidence.proxyMissionIds).toEqual(['bread']);
    expect(hasM2Proxy(evidence)).toBe(false);
    evidence = addM2ProxyMission(evidence, 'toast');
    expect(evidence.proxyMissionIds).toEqual(['bread', 'toast']);
    expect(hasM2Proxy(evidence)).toBe(true);
  });

  it('is idempotent for a repeated mission id — does not double-count within one mission', () => {
    let evidence: M2Evidence = { proxyMissionIds: [] };
    evidence = addM2ProxyMission(evidence, 'bread');
    evidence = addM2ProxyMission(evidence, 'bread');
    evidence = addM2ProxyMission(evidence, 'bread');
    expect(evidence.proxyMissionIds).toEqual(['bread']);
    expect(hasM2Proxy(evidence)).toBe(false);
  });

  it('reaching the two-distinct-mission threshold never, by itself, produces a milestones.M2 value', () => {
    // hasM2Proxy is evidence/readiness only. Nothing in this module wires its result into
    // achieve('M2', ...) or applyM2Confirmed — that is the whole point of the M2a/M2b split.
    let evidence: M2Evidence = { proxyMissionIds: [] };
    evidence = addM2ProxyMission(evidence, 'bread');
    evidence = addM2ProxyMission(evidence, 'toast');
    expect(hasM2Proxy(evidence)).toBe(true);
    const milestones: MilestoneMap = {};
    expect(milestones.M2).toBeUndefined(); // no code path here ever sets it from evidence alone
  });
});

describe('memory moments (first-occurrence only, never overwritten)', () => {
  it('records first_three_chain once, with its mission id', () => {
    const map = recordFirstThreeChain({}, NOW, 'digmission');
    expect(map.first_three_chain).toEqual({ kind: 'first_three_chain', recordedAt: NOW, missionId: 'digmission' });
  });

  it('does not overwrite first_three_chain on a later call', () => {
    const first = recordFirstThreeChain({}, NOW, 'digmission');
    const second = recordFirstThreeChain(first, NOW + 1000, 'other-mission');
    expect(second).toEqual(first);
  });

  it('records first_blind_commit once, with its mission id', () => {
    const map = recordFirstBlindCommit({}, NOW, 'bread');
    expect(map.first_blind_commit).toEqual({ kind: 'first_blind_commit', recordedAt: NOW, missionId: 'bread' });
  });

  it('does not overwrite first_blind_commit on a later call', () => {
    const first = recordFirstBlindCommit({}, NOW, 'bread');
    const second = recordFirstBlindCommit(first, NOW + 1000, 'other-mission');
    expect(second).toEqual(first);
  });

  it('the two recorded kinds are independent of each other', () => {
    let map: MemoryMomentMap = {};
    map = recordFirstThreeChain(map, NOW, 'digmission');
    map = recordFirstBlindCommit(map, NOW + 1, 'bread');
    expect(map.first_three_chain?.missionId).toBe('digmission');
    expect(map.first_blind_commit?.missionId).toBe('bread');
  });

  it('no function in this module ever records the four kinds without authoritative evidence yet', () => {
    // first_evidence_question, first_perspective_question, outside_use and household_adult_unknown
    // are valid MemoryMomentKind values (representable per WO-08's required list) but nothing
    // exported from this module can produce one — confirmed by inspection of every exported
    // function's implementation, none of which references those four kind literals.
    let map: MemoryMomentMap = {};
    map = recordFirstThreeChain(map, NOW, 'digmission');
    map = recordFirstBlindCommit(map, NOW, 'bread');
    expect(map.first_evidence_question).toBeUndefined();
    expect(map.first_perspective_question).toBeUndefined();
    expect(map.outside_use).toBeUndefined();
    expect(map.household_adult_unknown).toBeUndefined();
  });
});
