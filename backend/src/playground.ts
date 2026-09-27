import type { Env } from './types.js';
import type { PlaygroundLockDoc } from './schema.js';
import { playgroundLockPath } from './schema.js';

/**
 * WO-C5 §6: `config/playground.lockedSections`, edited by hand in the Firestore console — the
 * exact same pattern as `getCourseAllowedFamilyIds` (backend/src/course.ts): a small typed getter
 * with an empty-array default when the doc doesn't exist yet (the WO's own "empty lock list for
 * later" — the Playground is free entry for every logged-in family until a section id is added
 * here).
 */
export async function getPlaygroundLockedSections(env: Env): Promise<string[]> {
  const doc = await env.db.get<PlaygroundLockDoc>(playgroundLockPath());
  return doc?.sectionIds ?? [];
}

export async function isPlaygroundSectionLocked(env: Env, sectionId: string): Promise<boolean> {
  const locked = await getPlaygroundLockedSections(env);
  return locked.includes(sectionId);
}
