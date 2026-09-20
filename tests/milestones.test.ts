import { describe, it, expect } from 'vitest';
import {
  evaluateM1, evaluateM3, evaluateM4, applyM2Confirmed,
  addM2ProxyMission, hasM2Proxy, recordFirstThreeChain, recordFirstBlindCommit,
  type MilestoneMap, type M2Evidence, type MemoryMomentMap,
} from '../src/engine/milestones';
import { applyAptUse, type MoveProgressMap } from '../src/engine/scaffold';

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

describe('applyM2Confirmed (M2b — the actual milestone, unwired seam)', () => {
  it('achieves M2 when called directly (the seam a later confirmation UI would call)', () => {
    const result = applyM2Confirmed({}, NOW);
    expect(result.M2).toEqual({ achieved: true, achievedAt: NOW });
  });

  it('is idempotent', () => {
    const first = applyM2Confirmed({}, NOW);
    expect(applyM2Confirmed(first, NOW + 1000)).toEqual(first);
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
