import type { AppState, Profile } from '../engine/storage';
import type { Stage } from '../engine/types';
import type { MeResponse } from './api';
import * as api from './api';
import { applyModuleProgressToProfile, moduleProgressFromProfile } from './progressBridge';

function activeModuleIds(me: MeResponse): string[] {
  return me.entitlements.filter((e) => e.status === 'active').map((e) => e.moduleId);
}

/**
 * AD-13 §5 step 4 / acceptance test 10: "clear all site data -> log in -> every profile and all
 * progress restored." A profile already known locally keeps its locally-cached progress
 * untouched (no network round trip on every ordinary boot); a profile that's new to this device
 * (a fresh install, or one created on another device) gets its progress fetched once, here.
 */
export async function hydrateFromServer(state: AppState, me: MeResponse, moduleId: string): Promise<AppState> {
  const profiles: Profile[] = [];
  for (const remote of me.profiles) {
    const existing = state.profiles.find((p) => p.id === remote.id);
    if (existing) {
      profiles.push(existing);
      continue;
    }
    const base: Profile = {
      id: remote.id,
      avatarId: remote.avatarId,
      nicknameId: remote.nicknameId,
      stage: remote.stage as Stage,
      progress: {},
    };
    const progress = await api.getProgress(remote.id, moduleId);
    profiles.push(progress ? applyModuleProgressToProfile(base, progress) : base);
  }
  return { ...state, profiles, familyId: me.familyId, cachedEntitlements: activeModuleIds(me) };
}

/**
 * AD-13 §5 step 3.4: every profile that existed locally BEFORE this login (played as the
 * account-free guest — AD-13 §1) is imported into the family, exactly once each. The device's
 * own already-stable local profile id doubles as the import's idempotency key (backend/src/
 * handlers/importHandler.ts): a retried call for the same profile can never create a second
 * server profile or double-merge its progress. A profile the backend refuses (409, family
 * already at the 6-profile cap) is left as-is — still playable locally, just not yet part of the
 * family; AD-13 doesn't ship the "pick a profile to merge into" UI for that edge case, so it's a
 * known follow-up, not a silent data loss (nothing about the local profile is touched or lost).
 */
export async function importGuestProfiles(state: AppState, moduleId: string): Promise<AppState> {
  const profiles: Profile[] = [];
  for (const profile of state.profiles) {
    const result = await api.importGuestProfile({
      importId: profile.id,
      moduleId,
      guestProfile: { avatarId: profile.avatarId, nicknameId: profile.nicknameId, stage: profile.stage },
      progress: moduleProgressFromProfile(profile),
    });
    if (!('profileId' in result)) {
      profiles.push(profile); // not_configured/network/server/max_profiles — kept local, unimported
      continue;
    }
    profiles.push({ ...profile, id: result.profileId });
  }
  return { ...state, profiles };
}

/** Marks a profile's progress dirty for the next sync flush — call from the same place
 *  MissionShell already calls `save()` after a progress-affecting change, never from render. */
export function markProgressDirty(state: AppState, profileId: string, moduleId: string): AppState {
  const key = `${profileId}:${moduleId}`;
  if (state.pendingSyncKeys.includes(key)) return state;
  return { ...state, pendingSyncKeys: [...state.pendingSyncKeys, key] };
}

/**
 * AD-13 §3 `PUT .../progress/{moduleId}`: sends every dirty profile's CURRENT local progress
 * (never a diff/op-log — the server's own monotonic merge, shared/progressMerge.ts, is what
 * makes that safe against reordering or a retried flush) and applies the merged result the
 * server hands back. A key whose PUT fails (offline, server error) stays queued for the next
 * flush rather than being dropped.
 */
export async function flushPendingSync(state: AppState, moduleId: string): Promise<AppState> {
  if (!state.familyId) return state;
  let profiles = state.profiles;
  const remaining: string[] = [];
  for (const key of state.pendingSyncKeys) {
    const [profileId, keyModuleId] = key.split(':');
    if (keyModuleId !== moduleId) {
      remaining.push(key);
      continue;
    }
    const index = profiles.findIndex((p) => p.id === profileId);
    if (index === -1) continue; // profile no longer exists locally — nothing left to flush
    const merged = await api.putProgress(profileId!, moduleId, moduleProgressFromProfile(profiles[index]!));
    if (!merged) {
      remaining.push(key);
      continue;
    }
    profiles = profiles.map((p, i) => (i === index ? applyModuleProgressToProfile(p, merged) : p));
  }
  return { ...state, profiles, pendingSyncKeys: remaining };
}
