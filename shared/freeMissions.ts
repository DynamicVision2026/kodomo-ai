/**
 * AD-15: "trial content = Lesson 1-1 only" + "server-side progress-write enforcement" both need
 * the backend to know which mission ids are free/trial-accessible, without depending on the
 * content pipeline tree (`src/modules/`) — backend/src/ is deliberately platform-neutral and
 * content-agnostic, same reasoning as shared/presetIds.ts.
 *
 * This is NOT imported by the frontend — `src/modules/m1/module.json`'s own `freeMissionIds`
 * field remains the one real, authored source of truth the engine/UI reads
 * (src/shell/MissionShell.tsx). This is a deliberately duplicated, backend-only mirror of it,
 * kept in sync by tests/sharedFreeMissions.test.ts (which reads module.json directly and fails
 * CI the moment the two diverge) rather than by a shared import, since coupling backend/src/ to
 * the content build tree is exactly what the platform-neutral/platform-glue split exists to avoid.
 */
export const FREE_MISSION_IDS: Record<string, string[]> = {
  m1: ['m1-s2-1-1'],
};

export function isFreeMission(moduleId: string, missionId: string): boolean {
  return (FREE_MISSION_IDS[moduleId] ?? []).includes(missionId);
}
