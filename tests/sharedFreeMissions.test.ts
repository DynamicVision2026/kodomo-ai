import { describe, it, expect } from 'vitest';
import { FREE_MISSION_IDS, isFreeMission } from '../shared/freeMissions';
import moduleJson from '../src/modules/m1/module.json';

/**
 * shared/freeMissions.ts is a deliberately duplicated, backend-only mirror of module.json's own
 * `freeMissionIds` (see that file's own doc comment for why it isn't a shared import). This test
 * is the guard that keeps the duplication honest: if a future content change ever edits
 * module.json's free-mission list without updating this file, CI fails here instead of the
 * divergence silently reaching production (a mission that's free client-side but rejected
 * server-side, or vice versa).
 */
describe('shared/freeMissions.ts stays in sync with module.json', () => {
  it('m1\'s free mission ids match exactly', () => {
    expect(FREE_MISSION_IDS[moduleJson.id]).toEqual(moduleJson.freeMissionIds);
  });

  it('isFreeMission agrees with module.json for both a free and a non-free mission', () => {
    expect(isFreeMission(moduleJson.id, moduleJson.freeMissionIds[0]!)).toBe(true);
    expect(isFreeMission(moduleJson.id, 'not-a-real-mission-id')).toBe(false);
  });
});
