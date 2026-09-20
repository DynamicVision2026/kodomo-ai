import { describe, it, expect } from 'vitest';
import {
  applyMoveRendered, applyAptUse, applyBlindCommit, isAptUse, isAtLeast, type MoveProgressMap,
} from '../src/engine/scaffold';

describe('isAptUse (WO-04 Critical distinction)', () => {
  it('qualifies the first play at a layer when it is a deepen card', () => {
    expect(isAptUse(0, 'deepen')).toBe(true);
  });

  it('does not qualify a deepen card played second or later at the same layer', () => {
    expect(isAptUse(1, 'deepen')).toBe(false);
    expect(isAptUse(2, 'deepen')).toBe(false);
  });

  it('does not qualify a sideways/repeat/offtopic card, even as the first play', () => {
    expect(isAptUse(0, 'sideways')).toBe(false);
    expect(isAptUse(0, 'repeat')).toBe(false);
    expect(isAptUse(0, 'offtopic')).toBe(false);
  });
});

describe('applyMoveRendered (mihakken -> moratta)', () => {
  it('advances an unseen move straight to moratta', () => {
    const map = applyMoveRendered({}, 'follow-naze');
    expect(map['follow-naze']).toEqual({ rung: 'moratta', aptUseDomains: [] });
  });

  it('is a no-op once the move has already reached moratta or beyond', () => {
    const rendered = applyMoveRendered({}, 'follow-naze');
    expect(applyMoveRendered(rendered, 'follow-naze')).toEqual(rendered);
  });

  it('never regresses a move that has already progressed further (e.g. via apt_use)', () => {
    let map: MoveProgressMap = {};
    map = applyAptUse(map, 'follow-naze', '日常');
    map = applyAptUse(map, 'follow-naze', 'ことば');
    map = applyAptUse(map, 'follow-naze', '社会とひと'); // 3 distinct domains -> tsukaeru
    expect(map['follow-naze']!.rung).toBe('tsukaeru');
    const rendered = applyMoveRendered(map, 'follow-naze');
    expect(rendered['follow-naze']!.rung).toBe('tsukaeru'); // still tsukaeru, not knocked back to moratta
  });
});

describe('applyAptUse (moratta -> tsukaeru, three DISTINCT domains)', () => {
  it('does not reach tsukaeru after only one qualifying apt_use', () => {
    const map = applyAptUse({}, 'follow-naze', '日常');
    expect(map['follow-naze']!.rung).toBe('moratta');
  });

  it('Critical distinction: three apt_use events in the SAME domain are not enough', () => {
    let map: MoveProgressMap = {};
    map = applyAptUse(map, 'follow-naze', '日常');
    map = applyAptUse(map, 'follow-naze', '日常');
    map = applyAptUse(map, 'follow-naze', '日常');
    expect(map['follow-naze']!.aptUseDomains).toEqual(['日常']); // one distinct domain, not three
    expect(map['follow-naze']!.rung).toBe('moratta');
  });

  it('reaches tsukaeru once qualifying apt_use has occurred in three distinct domains', () => {
    let map: MoveProgressMap = {};
    map = applyAptUse(map, 'follow-naze', '日常');
    map = applyAptUse(map, 'follow-naze', 'ことば');
    expect(map['follow-naze']!.rung).toBe('moratta'); // only 2 so far
    map = applyAptUse(map, 'follow-naze', '社会とひと');
    expect(map['follow-naze']!.rung).toBe('tsukaeru');
  });

  it('does not double-count a domain repeated after the move already reached tsukaeru', () => {
    let map: MoveProgressMap = {};
    for (const domain of ['日常', 'ことば', '社会とひと']) map = applyAptUse(map, 'follow-naze', domain);
    const atThreshold = map;
    map = applyAptUse(map, 'follow-naze', '日常'); // repeat
    expect(map).toEqual(atThreshold);
  });

  it('tracks progression independently per move', () => {
    let map: MoveProgressMap = {};
    map = applyAptUse(map, 'follow-naze', '日常');
    map = applyAptUse(map, 'follow-naze', 'ことば');
    map = applyAptUse(map, 'follow-naze', '社会とひと');
    map = applyAptUse(map, 'follow-tatoeba', '日常'); // a different move, one domain only
    expect(map['follow-naze']!.rung).toBe('tsukaeru');
    expect(map['follow-tatoeba']!.rung).toBe('moratta');
  });

  it('progression never moves backwards regardless of call order', () => {
    let map: MoveProgressMap = {};
    map = applyAptUse(map, 'follow-naze', '日常');
    map = applyAptUse(map, 'follow-naze', 'ことば');
    map = applyAptUse(map, 'follow-naze', '社会とひと');
    const advanced = map;
    // A later render or a repeat apt_use in an already-counted domain must not knock it back.
    map = applyMoveRendered(map, 'follow-naze');
    map = applyAptUse(map, 'follow-naze', '日常');
    expect(map).toEqual(advanced);
  });
});

// WO-07 fills in the seam WO-04 left for blind_commit.
describe('applyBlindCommit (tsukaeru -> hitoride)', () => {
  function atTsukaeru(): MoveProgressMap {
    let map: MoveProgressMap = {};
    for (const domain of ['日常', 'ことば', '社会とひと']) map = applyAptUse(map, 'follow-naze', domain);
    return map;
  }

  it('advances a move already at tsukaeru to hitoride', () => {
    const map = applyBlindCommit(atTsukaeru(), 'follow-naze');
    expect(map['follow-naze']!.rung).toBe('hitoride');
  });

  it('does not require, or care about, semantic evaluation of what the child said — the function takes no such input', () => {
    // applyBlindCommit's signature is (map, move) only; there is no argument through which a
    // spoken/free-form question, its correctness, or its content could even be passed in.
    expect(applyBlindCommit.length).toBe(2);
  });

  it('is a no-op — never a skip-ahead to hitoride — for a move below tsukaeru', () => {
    const belowThreshold = applyAptUse({}, 'follow-naze', '日常'); // only 1 domain -> moratta
    expect(belowThreshold['follow-naze']!.rung).toBe('moratta');
    const after = applyBlindCommit(belowThreshold, 'follow-naze');
    expect(after).toEqual(belowThreshold);
    expect(after['follow-naze']!.rung).not.toBe('hitoride');
  });

  it('is a no-op for a move with no progress at all (mihakken)', () => {
    const after = applyBlindCommit({}, 'follow-naze');
    expect(after).toEqual({});
  });

  it('never regresses, and is idempotent once already at hitoride', () => {
    const hitoride = applyBlindCommit(atTsukaeru(), 'follow-naze');
    expect(applyBlindCommit(hitoride, 'follow-naze')).toEqual(hitoride);
  });

  it('advances only the committed move — another move\'s progression is unaffected', () => {
    let map = atTsukaeru(); // follow-naze at tsukaeru
    map = applyAptUse(map, 'follow-tatoeba', '日常'); // a second move, still at moratta
    map = applyBlindCommit(map, 'follow-naze');
    expect(map['follow-naze']!.rung).toBe('hitoride');
    expect(map['follow-tatoeba']!.rung).toBe('moratta'); // untouched
  });

  it('leaves aptUseDomains untouched — no new scoring or counters introduced', () => {
    const before = atTsukaeru();
    const after = applyBlindCommit(before, 'follow-naze');
    expect(after['follow-naze']!.aptUseDomains).toEqual(before['follow-naze']!.aptUseDomains);
  });
});

describe('isAtLeast (exported for Blind-first eligibility checks)', () => {
  it('treats tsukaeru as eligible, and mihakken/moratta as not', () => {
    expect(isAtLeast('tsukaeru', 'tsukaeru')).toBe(true);
    expect(isAtLeast('hitoride', 'tsukaeru')).toBe(true);
    expect(isAtLeast('moratta', 'tsukaeru')).toBe(false);
    expect(isAtLeast('mihakken', 'tsukaeru')).toBe(false);
  });
});

// WO-04 explicitly left hitoride/sotode to later tickets; WO-07 fills in hitoride only.
describe('scaffold leaves a clean seam for sotode, the one remaining later rung', () => {
  it('sotode is a valid ScaffoldRung value, unreachable by any function in this module', () => {
    let map: MoveProgressMap = {};
    for (const domain of ['日常', 'ことば', '社会とひと']) map = applyAptUse(map, 'follow-naze', domain);
    map = applyBlindCommit(map, 'follow-naze');
    expect(map['follow-naze']!.rung).toBe('hitoride');
    // No function in this module can produce 'sotode' — that's outside_use's later ticket.
  });
});
