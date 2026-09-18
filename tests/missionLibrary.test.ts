import { describe, it, expect } from 'vitest';
import { pickNextMission } from '../src/shell/missionLibrary';
import type { Profile } from '../src/engine/storage';
import type { Mission } from '../src/engine/types';

function profile(stage: 1 | 2 | 3, progress: Profile['progress'] = {}): Profile {
  return { id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage, progress };
}

const missionOrder = ['m-s2-a', 'm-s2-b', 'm-s3-a'];
const missions: Record<string, Pick<Mission, 'id' | 'stage'>> = {
  'm-s2-a': { id: 'm-s2-a', stage: 2 },
  'm-s2-b': { id: 'm-s2-b', stage: 2 },
  'm-s3-a': { id: 'm-s3-a', stage: 3 },
};

describe('pickNextMission', () => {
  it('picks the first undone mission at the profile\'s own stage, skipping other stages', () => {
    expect(pickNextMission(missionOrder, missions, profile(2))).toBe('m-s2-a');
  });

  it('advances to the next mission at the same stage once the first is done', () => {
    const p = profile(2, { 'm-s2-a': { done: true, stamps: 1, coop: false } });
    expect(pickNextMission(missionOrder, missions, p)).toBe('m-s2-b');
  });

  it('returns the Stage 3 mission for a Stage 3 profile even though it is last in order', () => {
    expect(pickNextMission(missionOrder, missions, profile(3))).toBe('m-s3-a');
  });

  it('a profile now at Stage 3 that had already completed a Stage 2 mission gets the Stage 3 one, not a repeat of Stage 2', () => {
    const p = profile(3, { 'm-s2-a': { done: true, stamps: 1, coop: false } });
    expect(pickNextMission(missionOrder, missions, p)).toBe('m-s3-a');
  });

  it('a profile that has completed every Stage 2 mission stays at Stage 2 (never auto-promotes)', () => {
    const p = profile(2, {
      'm-s2-a': { done: true, stamps: 1, coop: false },
      'm-s2-b': { done: true, stamps: 1, coop: false },
    });
    expect(pickNextMission(missionOrder, missions, p)).toBeNull();
  });

  it('returns null for a stage the module has no missions at all for', () => {
    expect(pickNextMission(missionOrder, missions, profile(1))).toBeNull();
  });

  it('ignores a missionOrder id with no matching entry in the missions map', () => {
    const order = ['ghost', ...missionOrder];
    expect(pickNextMission(order, missions, profile(2))).toBe('m-s2-a');
  });
});
