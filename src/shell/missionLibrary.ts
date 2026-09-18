import type { Profile } from '../engine/storage';
import type { Mission } from '../engine/types';

/**
 * Smallest version of a mission library (docs/work-order-w2-stage-expansion.md §2.4): given a
 * module's `missionOrder` and every mission it ships (any stage), returns the first mission at
 * the given profile's own stage that isn't yet marked done in that profile's progress. Pure —
 * no rendering, no storage access.
 *
 * Out of scope here: a visual "choose your mission" screen, cross-module browsing. This just
 * proves a profile can actually reach the stage-appropriate content a module ships.
 */
export function pickNextMission(
  missionOrder: string[],
  missions: Record<string, Pick<Mission, 'id' | 'stage'>>,
  profile: Profile,
): string | null {
  for (const id of missionOrder) {
    const mission = missions[id];
    if (!mission || mission.stage !== profile.stage) continue;
    if (profile.progress[id]?.done) continue;
    return id;
  }
  return null;
}
