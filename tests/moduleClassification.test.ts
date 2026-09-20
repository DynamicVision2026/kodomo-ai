import { describe, it, expect } from 'vitest';
import {
  parseContentClass, topicKeyOf, extractImportedTopicKeys, checkMissions,
  type MissionEntry,
} from '../scripts/lib/moduleClassification';

function releaseMission(overrides: Partial<MissionEntry> = {}): MissionEntry {
  return {
    moduleId: 'm1',
    relPath: 'src/modules/m1/topics/tabemono/s2.json',
    contentClassRaw: 'release',
    mission: { review: { by: '酒井先生', date: '2026-09-20' } },
    facts: { claims: [{ id: 'c1', status: 'approved' }] },
    ...overrides,
  };
}

function syntheticMission(overrides: Partial<MissionEntry> = {}): MissionEntry {
  return {
    moduleId: 'm2-test',
    relPath: 'src/modules/m2-test/topics/dummy/s3.json',
    contentClassRaw: 'synthetic',
    mission: {},
    facts: { claims: [{ id: 'd1', status: 'pending' }] },
    ...overrides,
  };
}

function archivedMission(overrides: Partial<MissionEntry> = {}): MissionEntry {
  return {
    moduleId: 'm1',
    relPath: 'src/modules/m1/topics/bread/s2.json',
    contentClassRaw: 'archived',
    mission: { review: { by: '酒井先生', date: '2026-09-20' } },
    facts: { claims: [{ id: 'c1', status: 'approved' }, { id: 'c2', status: 'approved' }] },
    ...overrides,
  };
}

describe('parseContentClass (no default — missing/invalid never inferred)', () => {
  it('accepts exactly "release", "synthetic" and "archived"', () => {
    expect(parseContentClass('release')).toBe('release');
    expect(parseContentClass('synthetic')).toBe('synthetic');
    expect(parseContentClass('archived')).toBe('archived');
  });

  it('rejects everything else, including plausible-looking values', () => {
    expect(parseContentClass(undefined)).toBeNull();
    expect(parseContentClass(null)).toBeNull();
    expect(parseContentClass('')).toBeNull();
    expect(parseContentClass('Release')).toBeNull(); // case-sensitive, no normalization
    expect(parseContentClass('deprecated')).toBeNull();
    expect(parseContentClass('production')).toBeNull();
    expect(parseContentClass(true)).toBeNull();
  });
});

describe('topicKeyOf', () => {
  it('extracts the modules/<id>/topics/<id>/ segment from a mission relPath', () => {
    expect(topicKeyOf('src/modules/m1/topics/bread/s2.json')).toBe('modules/m1/topics/bread/');
  });

  it('returns null for a path with no /topics/ segment', () => {
    expect(topicKeyOf('src/modules/m1/module.json')).toBeNull();
    expect(topicKeyOf('src/modules/m1/deck.s2.json')).toBeNull();
  });
});

describe('checkMissions — contentClass validation (Acceptance Proof: missing/invalid fails)', () => {
  it('fails a mission with no contentClass field at all', () => {
    const m = releaseMission({ contentClassRaw: undefined });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/missing or unrecognised contentClass/);
    expect(issues[0]).toContain(m.relPath);
  });

  it('fails a mission with an unrecognised contentClass value', () => {
    const m = releaseMission({ contentClassRaw: 'draft' });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/missing or unrecognised contentClass/);
  });

  it('fails regardless of strict mode — this is a manifest error, not a release-readiness gap', () => {
    const m = releaseMission({ contentClassRaw: undefined });
    const normal = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    const release = checkMissions([m], { strict: true, productionImportedTopicKeys: new Set() });
    expect(normal.issues).toHaveLength(1);
    expect(release.issues).toHaveLength(1);
  });

  it('does not count a misclassified mission toward any class total', () => {
    const m = releaseMission({ contentClassRaw: 'nonsense' });
    const r = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(r.releaseTopicCount).toBe(0);
    expect(r.syntheticTopicCount).toBe(0);
    expect(r.archivedTopicCount).toBe(0);
  });
});

describe('checkMissions — release missions require genuine human approvals', () => {
  it('passes a release mission with an approved claim, non-strict', () => {
    const { issues } = checkMissions([releaseMission()], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('fails a release mission with an unapproved claim', () => {
    const m = releaseMission({ facts: { claims: [{ id: 'c1', status: 'pending' }] } });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([`${m.relPath} uses facts.yaml with unapproved claims: c1`]);
  });

  it('fails a release mission with no facts.yaml beside it', () => {
    const m = releaseMission({ facts: null });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([`${m.relPath} has no facts.yaml beside it`]);
  });

  it('does not require a review stamp in normal (non-RELEASE) mode', () => {
    const m = releaseMission({ mission: {} });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('RELEASE=1 (strict) fails a release mission missing both its Gate 2 review stamp and a Gate 2 waiver', () => {
    const m = releaseMission({ mission: {} });
    const { issues } = checkMissions([m], { strict: true, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([`${m.relPath} has no native-speaker review stamp and no Gate 2 waiver (RELEASE=1)`]);
  });

  it('RELEASE=1 passes a release mission with both an approved claim and a review stamp', () => {
    const { issues } = checkMissions([releaseMission()], { strict: true, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('RELEASE=1 (WO-21 Phase 0) passes a release mission with an explicit Gate 2 waiver in place of a review stamp', () => {
    const m = releaseMission({
      mission: { gate2Waiver: { waivedBy: '傅豊国', waivedAt: '2026-09-20', reason: 'Founder waived Gate 2 for this release cycle.' } },
    });
    const { issues } = checkMissions([m], { strict: true, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('a Gate 2 waiver never gets treated as a real review stamp: still fails without one when not strict-relevant to waiver but claims are unapproved', () => {
    // A waiver only ever substitutes for the RELEASE=1 review-stamp check — it never satisfies
    // the separate Gate 1 (approved-claims) requirement, which is checked independently.
    const m = releaseMission({
      mission: { gate2Waiver: { waivedBy: '傅豊国', waivedAt: '2026-09-20', reason: 'Founder waived Gate 2 for this release cycle.' } },
      facts: { claims: [{ id: 'c1', status: 'pending' }] },
    });
    const { issues } = checkMissions([m], { strict: true, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([`${m.relPath} uses facts.yaml with unapproved claims: c1`]);
  });
});

describe('checkMissions — synthetic missions never require, and must never carry, human approval', () => {
  it('passes a synthetic mission whose claim is merely "pending" — no Gate 1 required', () => {
    const { issues } = checkMissions([syntheticMission()], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('passes a synthetic mission with no facts.yaml at all', () => {
    const m = syntheticMission({ facts: null });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('passes a synthetic mission even under RELEASE=1, with no review stamp', () => {
    const { issues } = checkMissions([syntheticMission()], { strict: true, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('FAILS a synthetic mission whose facts.yaml claim is marked approved', () => {
    const m = syntheticMission({ facts: { claims: [{ id: 'd1', status: 'approved' }] } });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/must never carry Gate 1 human approval/);
  });

  it('FAILS a synthetic mission whose mission carries a Gate 2 review stamp', () => {
    const m = syntheticMission({ mission: { review: { by: 'someone', date: '2026-01-01' } } });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/must never carry Gate 2 native-review approval/);
  });

  it('FAILS a synthetic mission whose mission carries a Gate 2 waiver (WO-21 Phase 0): synthetic content must never carry any release-gate decision', () => {
    const m = syntheticMission({
      mission: { gate2Waiver: { waivedBy: 'someone', waivedAt: '2026-01-01', reason: 'n/a' } },
    });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/must never carry a release-gate decision/);
  });
});

describe('checkMissions — archived missions (WO-11 decision 5): preserve real approval history, need no ongoing approval', () => {
  it('passes an archived mission that still carries its real, historical approved claims and review stamp — nothing here flags or touches them', () => {
    const { issues } = checkMissions([archivedMission()], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('passes an archived mission under RELEASE=1 too — no review-stamp requirement applies to archived content', () => {
    const { issues } = checkMissions([archivedMission()], { strict: true, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('passes an archived mission that was NEVER approved (e.g. retired before Gate 1/2 completed) — archived does not require prior approval, just excludes ongoing requirements', () => {
    const m = archivedMission({
      mission: {}, // no review stamp — genuinely never reached Gate 2
      facts: { claims: [{ id: 'c1', status: 'pending' }] }, // genuinely never reached Gate 1
    });
    const normal = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    const release = checkMissions([m], { strict: true, productionImportedTopicKeys: new Set() });
    expect(normal.issues).toEqual([]);
    expect(release.issues).toEqual([]);
  });

  it('does not require facts.yaml to exist at all', () => {
    const m = archivedMission({ facts: null });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });
});

describe('checkMissions — production reachability (synthetic AND archived must never be reachable)', () => {
  it('fails when a synthetic mission\'s own topic folder is found imported from production source', () => {
    const m = syntheticMission();
    const { issues } = checkMissions([m], {
      strict: false,
      productionImportedTopicKeys: new Set([topicKeyOf(m.relPath)!]),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/classified synthetic .* imported from production/);
  });

  it('fails when an archived mission\'s own topic folder is found imported from production source — this is the guardrail that made bread/ice unreachable', () => {
    const m = archivedMission();
    const { issues } = checkMissions([m], {
      strict: false,
      productionImportedTopicKeys: new Set([topicKeyOf(m.relPath)!]),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/classified archived .* imported from production/);
  });

  it('does not flag a release mission for being imported from production — that is expected', () => {
    const m = releaseMission();
    const { issues } = checkMissions([m], {
      strict: false,
      productionImportedTopicKeys: new Set([topicKeyOf(m.relPath)!]),
    });
    expect(issues).toEqual([]);
  });

  it('does not flag a synthetic or archived mission that is NOT reachable from production', () => {
    const other = new Set(['modules/m1/topics/some-other-topic/']);
    expect(checkMissions([syntheticMission()], { strict: false, productionImportedTopicKeys: other }).issues).toEqual([]);
    expect(checkMissions([archivedMission()], { strict: false, productionImportedTopicKeys: other }).issues).toEqual([]);
  });
});

describe('checkMissions — topic counts are reported (Acceptance Proof: truthful release-topic count)', () => {
  it('counts release, synthetic and archived missions independently across a mixed set', () => {
    const result = checkMissions(
      [archivedMission({ relPath: 'src/modules/m1/topics/bread/s2.json' }),
       archivedMission({ relPath: 'src/modules/m1/topics/ice/s2.json' }),
       syntheticMission()],
      { strict: false, productionImportedTopicKeys: new Set() },
    );
    expect(result.releaseTopicCount).toBe(0); // truthfully zero — no manufactured release topic
    expect(result.syntheticTopicCount).toBe(1);
    expect(result.archivedTopicCount).toBe(2);
    expect(result.issues).toEqual([]);
  });
});

describe('checkMissions — rootType enforcement (WO-11C: closed set, deterministic rejection)', () => {
  it('passes a mission with no rootType at all — the field is optional', () => {
    const { issues } = checkMissions([releaseMission()], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it.each(['しくみ', 'めあて', 'わかれ'])('passes a mission whose rootType is the accepted value %s', (rootType) => {
    const m = releaseMission({ rootTypeRaw: rootType });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toEqual([]);
  });

  it('FAILS a mission whose rootType is an arbitrary fourth value — adversarial proof', () => {
    const m = releaseMission({ rootTypeRaw: 'よそく' });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/unsupported rootType/);
    expect(issues[0]).toContain('よそく');
  });

  it('FAILS on a romanized or near-miss rootType — no normalization or coercion', () => {
    const m = releaseMission({ rootTypeRaw: 'shikumi' });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/unsupported rootType/);
  });

  it('rejects an invalid rootType regardless of contentClass — synthetic and archived missions are checked too', () => {
    const synth = syntheticMission({ rootTypeRaw: 'other' });
    const archived = archivedMission({ rootTypeRaw: 'other' });
    expect(checkMissions([synth], { strict: false, productionImportedTopicKeys: new Set() }).issues).toHaveLength(1);
    expect(checkMissions([archived], { strict: false, productionImportedTopicKeys: new Set() }).issues).toHaveLength(1);
  });

  it('an invalid rootType is reported even when contentClass is ALSO invalid — both are independent structural errors', () => {
    const m = releaseMission({ contentClassRaw: 'nonsense', rootTypeRaw: 'other' });
    const { issues } = checkMissions([m], { strict: false, productionImportedTopicKeys: new Set() });
    expect(issues).toHaveLength(2);
    expect(issues.some((i) => /unsupported rootType/.test(i))).toBe(true);
    expect(issues.some((i) => /missing or unrecognised contentClass/.test(i))).toBe(true);
  });
});

describe('extractImportedTopicKeys', () => {
  it('extracts a topic key from a relative import path', () => {
    const keys = extractImportedTopicKeys([`import m from './modules/m1/topics/bread/s2.json';`]);
    expect(keys).toEqual(new Set(['modules/m1/topics/bread/']));
  });

  it('extracts a topic key from a deeper relative path (../..)', () => {
    const keys = extractImportedTopicKeys([`import m from '../../modules/m1/topics/ice/s2.json';`]);
    expect(keys).toEqual(new Set(['modules/m1/topics/ice/']));
  });

  it('does NOT capture a plain module.json or deck.sN.json import — those are not topic content', () => {
    const keys = extractImportedTopicKeys([
      `import moduleJson from './modules/m1/module.json';`,
      `import deck from '../../modules/m1/deck.s2.json';`,
    ]);
    expect(keys).toEqual(new Set());
  });

  it('extracts every distinct topic key across multiple files, de-duplicated', () => {
    const keys = extractImportedTopicKeys([
      `import a from './modules/m1/topics/bread/s2.json';`,
      `import b from './modules/m1/topics/bread/facts.yaml';`, // same topic, still one key
      `import c from './modules/m2-test/topics/dummy/s3.json';`,
    ]);
    expect(keys).toEqual(new Set(['modules/m1/topics/bread/', 'modules/m2-test/topics/dummy/']));
  });

  it('finds nothing in a file with no /topics/ import', () => {
    const keys = extractImportedTopicKeys([`import { useState } from 'react';`]);
    expect(keys).toEqual(new Set());
  });
});
