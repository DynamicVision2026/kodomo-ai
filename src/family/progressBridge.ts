import type { Profile } from '../engine/storage';
import type { ModuleProgressState } from '../../shared/progressMerge';
import { emptyModuleProgress } from '../../shared/progressMerge';

/** Projects the slice of an engine `Profile` the shared monotonic-merge function operates on.
 *  Every field here already existed on `Profile` before AD-13 (WO-04/WO-08/WO-24) — this is a
 *  read, never a redesign of what a profile tracks. */
export function moduleProgressFromProfile(profile: Profile): ModuleProgressState {
  const base = emptyModuleProgress();
  return {
    missions: profile.progress ?? base.missions,
    moveProgress: profile.moveProgress ?? base.moveProgress,
    milestones: profile.milestones ?? base.milestones,
    m2Evidence: profile.m2Evidence ?? base.m2Evidence,
    memories: profile.memories ?? base.memories,
    guidance: profile.guidance ?? base.guidance,
  };
}

/** The inverse: writes a (possibly server-merged) `ModuleProgressState` back onto a `Profile`,
 *  leaving every other field (`id`, `avatarId`, `nicknameId`, `stage`) untouched. */
export function applyModuleProgressToProfile(profile: Profile, state: ModuleProgressState): Profile {
  return {
    ...profile,
    progress: state.missions as Profile['progress'],
    moveProgress: state.moveProgress as Profile['moveProgress'],
    milestones: state.milestones as Profile['milestones'],
    m2Evidence: state.m2Evidence,
    memories: state.memories as Profile['memories'],
    guidance: state.guidance,
  };
}
