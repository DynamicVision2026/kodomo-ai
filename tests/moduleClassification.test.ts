import { describe, it, expect } from 'vitest';
import {
  parseContentClass, extractImportedModuleIds, checkModules,
  type ModuleEntry,
} from '../scripts/lib/moduleClassification';

function releaseModule(overrides: Partial<ModuleEntry> = {}): ModuleEntry {
  return {
    id: 'm1',
    contentClassRaw: 'release',
    missions: [{
      relPath: 'src/modules/m1/topics/bread/s2.json',
      mission: { review: { by: '酒井先生', date: '2026-09-20' } },
      facts: { claims: [{ id: 'c1', status: 'approved' }] },
    }],
    ...overrides,
  };
}

function syntheticModule(overrides: Partial<ModuleEntry> = {}): ModuleEntry {
  return {
    id: 'm2-test',
    contentClassRaw: 'synthetic',
    missions: [{
      relPath: 'src/modules/m2-test/topics/dummy/s3.json',
      mission: {},
      facts: { claims: [{ id: 'd1', status: 'pending' }] },
    }],
    ...overrides,
  };
}

describe('parseContentClass (no default — missing/invalid never inferred)', () => {
  it('accepts exactly "release" and "synthetic"', () => {
    expect(parseContentClass('release')).toBe('release');
    expect(parseContentClass('synthetic')).toBe('synthetic');
  });

  it('rejects everything else, including plausible-looking values', () => {
    expect(parseContentClass(undefined)).toBeNull();
    expect(parseContentClass(null)).toBeNull();
    expect(parseContentClass('')).toBeNull();
    expect(parseContentClass('Release')).toBeNull(); // case-sensitive, no normalization
    expect(parseContentClass('test')).toBeNull();
    expect(parseContentClass('production')).toBeNull();
    expect(parseContentClass(true)).toBeNull();
  });
});

describe('checkModules — contentClass validation (Acceptance Proof: missing/invalid fails)', () => {
  it('fails a module with no contentClass field at all', () => {
    const mod = releaseModule({ contentClassRaw: undefined });
    const { issues } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/missing or unrecognised contentClass/);
    expect(issues[0]).toContain('m1');
  });

  it('fails a module with an unrecognised contentClass value', () => {
    const mod = releaseModule({ contentClassRaw: 'draft' });
    const { issues } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/missing or unrecognised contentClass/);
  });

  it('fails regardless of strict mode — this is a manifest error, not a release-readiness gap', () => {
    const mod = releaseModule({ contentClassRaw: undefined });
    const normal = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    const release = checkModules([mod], { strict: true, productionImportedModuleIds: new Set() });
    expect(normal.issues).toHaveLength(1);
    expect(release.issues).toHaveLength(1);
  });

  it('does not count a misclassified module toward either release or synthetic totals', () => {
    const mod = releaseModule({ contentClassRaw: 'nonsense' });
    const { releaseModuleCount, syntheticModuleCount } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(releaseModuleCount).toBe(0);
    expect(syntheticModuleCount).toBe(0);
  });
});

describe('checkModules — release modules require genuine human approvals', () => {
  it('passes a release module with an approved claim, non-strict', () => {
    const { issues } = checkModules([releaseModule()], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toEqual([]);
  });

  it('fails a release module with an unapproved claim', () => {
    const mod = releaseModule({ missions: [{
      relPath: 'src/modules/m1/topics/bread/s2.json',
      mission: {},
      facts: { claims: [{ id: 'c1', status: 'pending' }] },
    }] });
    const { issues } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toEqual(['src/modules/m1/topics/bread/s2.json uses facts.yaml with unapproved claims: c1']);
  });

  it('fails a release module with no facts.yaml beside its mission', () => {
    const mod = releaseModule({ missions: [{
      relPath: 'src/modules/m1/topics/bread/s2.json', mission: {}, facts: null,
    }] });
    const { issues } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toEqual(['src/modules/m1/topics/bread/s2.json has no facts.yaml beside it']);
  });

  it('does not require a review stamp in normal (non-RELEASE) mode', () => {
    const mod = releaseModule({ missions: [{
      relPath: 'src/modules/m1/topics/bread/s2.json',
      mission: {}, // no review field
      facts: { claims: [{ id: 'c1', status: 'approved' }] },
    }] });
    const { issues } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toEqual([]);
  });

  it('RELEASE=1 (strict) fails a release module missing its Gate 2 review stamp — proves removing bread\'s real stamp would fail RELEASE', () => {
    const mod = releaseModule({ missions: [{
      relPath: 'src/modules/m1/topics/bread/s2.json',
      mission: {}, // review stamp removed, as if 酒井先生's stamp were stripped
      facts: { claims: [{ id: 'c1', status: 'approved' }] },
    }] });
    const { issues } = checkModules([mod], { strict: true, productionImportedModuleIds: new Set() });
    expect(issues).toEqual(['src/modules/m1/topics/bread/s2.json has no native-speaker review stamp (RELEASE=1)']);
  });

  it('RELEASE=1 passes a release module with both an approved claim and a review stamp', () => {
    const { issues } = checkModules([releaseModule()], { strict: true, productionImportedModuleIds: new Set() });
    expect(issues).toEqual([]);
  });
});

describe('checkModules — synthetic modules never require, and must never carry, human approval', () => {
  it('passes a synthetic module whose claim is merely "pending" — no Gate 1 required', () => {
    const { issues } = checkModules([syntheticModule()], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toEqual([]);
  });

  it('passes a synthetic module with no facts.yaml at all — structural fixtures need no claims', () => {
    const mod = syntheticModule({ missions: [{
      relPath: 'src/modules/m2-test/topics/dummy/s3.json', mission: {}, facts: null,
    }] });
    const { issues } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toEqual([]);
  });

  it('passes a synthetic module even under RELEASE=1, with no review stamp', () => {
    const { issues } = checkModules([syntheticModule()], { strict: true, productionImportedModuleIds: new Set() });
    expect(issues).toEqual([]);
  });

  it('FAILS a synthetic module whose facts.yaml claim is marked approved (Acceptance Proof: synthetic + approval metadata fails)', () => {
    const mod = syntheticModule({ missions: [{
      relPath: 'src/modules/m2-test/topics/dummy/s3.json',
      mission: {},
      facts: { claims: [{ id: 'd1', status: 'approved' }] },
    }] });
    const { issues } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/synthetic module "m2-test"/);
    expect(issues[0]).toMatch(/must never carry Gate 1 human approval/);
  });

  it('FAILS a synthetic module whose mission carries a Gate 2 review stamp', () => {
    const mod = syntheticModule({ missions: [{
      relPath: 'src/modules/m2-test/topics/dummy/s3.json',
      mission: { review: { by: 'someone', date: '2026-01-01' } },
      facts: { claims: [{ id: 'd1', status: 'pending' }] },
    }] });
    const { issues } = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/synthetic module "m2-test"/);
    expect(issues[0]).toMatch(/must never carry Gate 2 native-review approval/);
  });

  it('this failure is independent of strict mode — forbidden in normal mode too', () => {
    const mod = syntheticModule({ missions: [{
      relPath: 'src/modules/m2-test/topics/dummy/s3.json',
      mission: {},
      facts: { claims: [{ id: 'd1', status: 'approved' }] },
    }] });
    const normal = checkModules([mod], { strict: false, productionImportedModuleIds: new Set() });
    const release = checkModules([mod], { strict: true, productionImportedModuleIds: new Set() });
    expect(normal.issues).toHaveLength(1);
    expect(release.issues).toHaveLength(1);
  });
});

describe('checkModules — production reachability (Acceptance Proof: synthetic reachability fails)', () => {
  it('fails when a synthetic module id is found imported from production source', () => {
    const { issues } = checkModules([syntheticModule()], {
      strict: false,
      productionImportedModuleIds: new Set(['m2-test']),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/module "m2-test" is classified synthetic but is imported from production/);
  });

  it('does not flag a release module for being imported from production — that is expected', () => {
    const { issues } = checkModules([releaseModule()], {
      strict: false,
      productionImportedModuleIds: new Set(['m1']),
    });
    expect(issues).toEqual([]);
  });

  it('does not flag a synthetic module that is NOT reachable from production', () => {
    const { issues } = checkModules([syntheticModule()], {
      strict: false,
      productionImportedModuleIds: new Set(['m1']), // only m1 is production-reachable
    });
    expect(issues).toEqual([]);
  });
});

describe('checkModules — release-module count is reported (Acceptance Proof)', () => {
  it('counts release and synthetic modules independently across a mixed set', () => {
    const result = checkModules(
      [releaseModule(), syntheticModule({ id: 'm2-test' }), syntheticModule({ id: 'stage1-test' })],
      { strict: false, productionImportedModuleIds: new Set() },
    );
    expect(result.releaseModuleCount).toBe(1);
    expect(result.syntheticModuleCount).toBe(2);
    expect(result.issues).toEqual([]);
  });
});

describe('extractImportedModuleIds', () => {
  it('extracts a module id from a relative import path', () => {
    const ids = extractImportedModuleIds([`import moduleJson from './modules/m1/module.json';`]);
    expect(ids).toEqual(new Set(['m1']));
  });

  it('extracts a module id from a deeper relative path (../..)', () => {
    const ids = extractImportedModuleIds([`import deck from '../../modules/m1/deck.s2.json';`]);
    expect(ids).toEqual(new Set(['m1']));
  });

  it('extracts every distinct module id across multiple files, de-duplicated', () => {
    const ids = extractImportedModuleIds([
      `import a from './modules/m1/module.json';`,
      `import b from './modules/m1/topics/bread/s2.json';`,
      `import c from './modules/m2-test/module.json';`,
    ]);
    expect(ids).toEqual(new Set(['m1', 'm2-test']));
  });

  it('finds nothing in a file with no modules/ import', () => {
    const ids = extractImportedModuleIds([`import { useState } from 'react';`]);
    expect(ids).toEqual(new Set());
  });
});
