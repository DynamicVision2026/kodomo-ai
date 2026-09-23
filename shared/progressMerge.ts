/**
 * AD-13 §2: the one pure monotonic-merge function, shared verbatim by the backend
 * (`backend/src/handlers/progress.ts`) and the client (`src/engine/storage.ts`'s sync queue) —
 * imported by both, never duplicated. Lives outside both `src/` and `backend/` so neither
 * tsconfig treats it as "belonging" to the other side; `tsconfig.json` and
 * `tsconfig.server.json` both add `"shared"` to their own `include` array.
 *
 * Structurally mirrors (never imports, to avoid a frontend<->backend tsconfig coupling) the
 * per-profile engine state already defined in src/engine/{storage,milestones,scaffold}.ts — a
 * module's whole progress is exactly the slice of that shape this module's Firestore doc holds
 * (AD-13 §2 table: `profiles/{pid}/progress/{moduleId}`).
 *
 * Field-by-field mapping onto AD-13 §2's merge rules (the spec's own rule vocabulary was written
 * for keyed/timestamped structures — `stamps` is the one scalar counter in this codebase, no
 * per-stamp timestamp exists to "keep the earliest" of, so it merges as the monotonic-counter
 * analogue: max, never re-derived, never decreasing):
 *  - `missions[id].done`                 -> OR
 *  - `missions[id].stamps`               -> max (scalar counter; see note above)
 *  - `missions[id].coop`                 -> OR
 *  - `milestones[id]`                    -> union; both achieved -> earliest achievedAt kept
 *  - `memories[kind]`                    -> union; both present -> earliest recordedAt kept
 *  - `m2Evidence.proxyMissionIds`        -> union (distinct mission ids)
 *  - `moveProgress[moveId].rung`         -> max by scaffold rung order (a guidance counter)
 *  - `moveProgress[moveId].aptUseDomains`-> union
 *  - `guidance[verb]`                    -> max (a guidance counter)
 */

export interface MergeMissionProgress {
  done: boolean;
  stamps: number;
  coop: boolean;
}

export interface MergeMilestoneState {
  achieved: boolean;
  achievedAt: number | null;
}

export interface MergeMemoryMoment {
  kind: string;
  recordedAt: number;
  missionId?: string;
}

export interface MergeMoveProgress {
  rung: string;
  aptUseDomains: string[];
}

export interface ModuleProgressState {
  missions: Record<string, MergeMissionProgress>;
  moveProgress: Record<string, MergeMoveProgress>;
  milestones: Partial<Record<string, MergeMilestoneState>>;
  m2Evidence: { proxyMissionIds: string[] };
  memories: Partial<Record<string, MergeMemoryMoment>>;
  guidance: Partial<Record<string, number>>;
}

export function emptyModuleProgress(): ModuleProgressState {
  return {
    missions: {},
    moveProgress: {},
    milestones: {},
    m2Evidence: { proxyMissionIds: [] },
    memories: {},
    guidance: {},
  };
}

/** src/engine/scaffold.ts's own RUNG_ORDER, duplicated rather than imported — see file header. */
const RUNG_ORDER = ['mihakken', 'moratta', 'tsukaeru', 'hitoride', 'sotode'];
function rungIndex(rung: string): number {
  const i = RUNG_ORDER.indexOf(rung);
  return i === -1 ? 0 : i;
}
function maxRung(a: string, b: string): string {
  return rungIndex(a) >= rungIndex(b) ? a : b;
}

function unionStrings(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function mergeMission(a?: MergeMissionProgress, b?: MergeMissionProgress): MergeMissionProgress {
  if (!a) return b!;
  if (!b) return a;
  return { done: a.done || b.done, stamps: Math.max(a.stamps, b.stamps), coop: a.coop || b.coop };
}

function mergeMoveProgress(a?: MergeMoveProgress, b?: MergeMoveProgress): MergeMoveProgress {
  if (!a) return b!;
  if (!b) return a;
  return { rung: maxRung(a.rung, b.rung), aptUseDomains: unionStrings(a.aptUseDomains, b.aptUseDomains) };
}

function mergeMilestone(a?: MergeMilestoneState, b?: MergeMilestoneState): MergeMilestoneState {
  if (!a) return b!;
  if (!b) return a;
  if (a.achieved && b.achieved) {
    const earliest =
      a.achievedAt === null ? b.achievedAt : b.achievedAt === null ? a.achievedAt : Math.min(a.achievedAt, b.achievedAt);
    return { achieved: true, achievedAt: earliest };
  }
  return a.achieved ? a : b;
}

function mergeMemory(a?: MergeMemoryMoment, b?: MergeMemoryMoment): MergeMemoryMoment {
  if (!a) return b!;
  if (!b) return a;
  return a.recordedAt <= b.recordedAt ? a : b;
}

function mergeRecord<T>(
  a: Partial<Record<string, T>>,
  b: Partial<Record<string, T>>,
  mergeOne: (a: T | undefined, b: T | undefined) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[key] = mergeOne(a[key], b[key]);
  }
  return out;
}

/**
 * Commutative and idempotent: `merge(a, b) === merge(b, a)`, and `merge(a, a) === a` (field by
 * field) — required for two devices to sync in either order, any number of times, with no event
 * ever lost or duplicated (AD-13 acceptance test 11).
 */
export function mergeModuleProgress(a: ModuleProgressState, b: ModuleProgressState): ModuleProgressState {
  return {
    missions: mergeRecord(a.missions, b.missions, mergeMission),
    moveProgress: mergeRecord(a.moveProgress, b.moveProgress, mergeMoveProgress),
    milestones: mergeRecord(a.milestones, b.milestones, mergeMilestone),
    m2Evidence: { proxyMissionIds: unionStrings(a.m2Evidence.proxyMissionIds, b.m2Evidence.proxyMissionIds) },
    memories: mergeRecord(a.memories, b.memories, mergeMemory),
    guidance: mergeRecord(
      a.guidance as Record<string, number>,
      b.guidance as Record<string, number>,
      (x, y) => Math.max(x ?? 0, y ?? 0),
    ),
  };
}
