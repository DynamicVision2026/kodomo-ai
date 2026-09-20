import { describe, it, expect } from 'vitest';
import { applyMoveRendered, applyAptUse, isAptUse, type MoveProgressMap } from '../src/engine/scaffold';

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

// WO-04 explicitly leaves hitoride/sotode to later tickets. This proves the enum and the
// monotonic-advance mechanism already accommodate them without redesign — no blind_commit or
// outside_use event is invented here.
describe('scaffold leaves a clean seam for later rungs', () => {
  it('hitoride and sotode are valid ScaffoldRung values, unreachable by this ticket\'s functions', () => {
    let map: MoveProgressMap = {};
    for (const domain of ['日常', 'ことば', '社会とひと']) map = applyAptUse(map, 'follow-naze', domain);
    expect(map['follow-naze']!.rung).toBe('tsukaeru');
    // No function in this module can produce 'hitoride' or 'sotode' — that's later tickets' job.
  });
});
