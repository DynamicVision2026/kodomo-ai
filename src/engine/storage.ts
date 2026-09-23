import type { Stage } from './types';
import type { MoveProgressMap } from './scaffold';
import type { MilestoneMap, M2Evidence, MemoryMomentMap } from './milestones';

/**
 * Local, per-device state. NO PII: preset avatar + preset nickname id + a stage number.
 * Never a grade, birthday, name, school or free text. Spec v0.5 §7.
 *
 * AD-13 §7: `m-app.v1` (the pre-Family-Account shape — `entitlements`/`redeemedCode`/`founder`,
 * the local-authority unlock-code fields) is migrated once, on first load after this ticket, into
 * `m-app.v2` — those three fields are simply dropped (entitlement is server-authoritative now,
 * see src/engine/entitlements.ts) and `familyId`/`pendingSyncKeys` are added. `profiles` itself is
 * untouched by the migration and by everything else in this file: MissionShell, ProfilePicker,
 * CourseHome etc. still read/write it exactly as before — server authority and the write queue
 * are additive (src/family/sync.ts), not a redesign of what a profile itself looks like.
 */
const KEY = 'm-app.v2';
const LEGACY_KEY = 'm-app.v1';

export interface Progress {
  done: boolean;
  stamps: number;
  coop: boolean;
  /** Builder work order correction (1): mirrors milestones.M2's own `afterCompare`, but PER
   *  MISSION rather than once-ever-profile-wide. milestones.M2 only achieves once, ever — a
   *  family with more than one CHECKPOINT mission (1-4/1-7/1-8) whose FIRST-EVER M2b
   *  confirmation happened normally (no compare) would otherwise silently lose the afterCompare
   *  fact for every later mission's own teach-back confirmation, since confirmM2b becomes a
   *  no-op once M2 is already achieved. Set by `addStamp()` (the actual per-mission teach-back
   *  record — both `confirmM2b()` call sites, in-mission and the standing parent dashboard, now
   *  call it), so it survives independent of whether that same confirmation also happened to be
   *  the one that achieved the global M2 milestone. */
  afterCompare?: boolean;
}
export interface Profile {
  id: string;
  avatarId: string;
  nicknameId: string;
  stage: Stage;
  progress: Record<string, Progress>;
  /** WO-04: per-move scaffold progression for this profile. Absent on profiles created before
   *  WO-04 — callers treat that the same as `{}`, never as an error. */
  moveProgress?: MoveProgressMap;
  /** WO-08: M0-M5 milestone state. Absent on pre-WO-08 profiles — treated the same as `{}`. */
  milestones?: MilestoneMap;
  /** WO-08: M2a system-proxy evidence, separate from `milestones.M2` — see src/engine/
   *  milestones.ts. Only an actual (not-yet-built) parent confirmation can ever set M2 itself. */
  m2Evidence?: M2Evidence;
  /** WO-08: durable, first-occurrence memory moments. */
  memories?: MemoryMomentMap;
  /** Builder work order "CHECKPOINT audio — fix solo completion" (correction 2): mission ids
   *  whose CHECKPOINT comparison audio this profile has actually heard (real playback started,
   *  not merely visited/skipped) — read by `confirmM2b` to decide `afterCompare` when a parent
   *  later confirms teach-back for one of these missions from the standing parent dashboard.
   *  Absent on profiles that predate this feature, treated the same as `[]`. Synced like
   *  `m2Evidence` — src/family/progressBridge.ts maps it onto/from ModuleProgressState, and
   *  shared/progressMerge.ts unions it across devices, so a fact recorded on one device is never
   *  lost when another device syncs. */
  checkpointAudioHeard?: string[];
  /** WO-24 (AD-07 §D): per-verb guidance use counts for the Mission 1 continuous stage
   *  (src/stage/Guidance.tsx) — SHOW/NUDGE/FADE/INDEPENDENT is always re-derived from this, never
   *  stored as a level itself. Deliberately untyped here (plain string keys) rather than
   *  importing src/stage's own StageVerb union — storage.ts is engine-layer infrastructure and
   *  never depends on the presentation layer; the stage module narrows this when it reads it.
   *  Absent on every profile before this WO, treated the same as `{}`. */
  guidance?: Partial<Record<string, number>>;
}
export interface AppState {
  profiles: Profile[];
  /** AD-13: the family this device is currently logged into, or null before the first login /
   *  after logout. Read by src/engine/entitlements.ts (via `cachedEntitlements`, never this field
   *  directly) and by MissionShell to decide whether a `profiles` entry is guest-local (no
   *  `familyId` yet — pre-login, or the free 1-1 guest path, AD-13 §1's own "stays account-free")
   *  or server-synced. */
  familyId: string | null;
  /** AD-13 §5 step 4: the last `/me` response's entitled module ids, cached so entitlement gating
   *  keeps working across a reload before the network round-trip completes (and offline).
   *  Refreshed by src/family/session.ts on every successful `/me`; never written any other way —
   *  see entitlements.ts's own doc comment for why that distinction is the actual security
   *  boundary now, the same role `redeemedCode` used to play under the old unlock-code system. */
  cachedEntitlements: string[];
  /** AD-13 §7: `${profileId}:${moduleId}` keys whose progress has changed locally since the last
   *  confirmed sync — a dirty-set, not a literal write log (the payload actually sent is always
   *  the CURRENT profile progress at flush time; server-side monotonic merge, not this queue,
   *  is what makes replay/reordering safe). Flushed by src/family/sync.ts; survives a reload or
   *  an offline gap so a queued change is never silently lost. */
  pendingSyncKeys: string[];
  abVariant: 'A' | 'B';
  /** Opaque, non-PII, per-device id. */
  deviceId: string;
}

/** AD-15: lowered from AD-13's original 6 — applies to every family, trial or paid. */
export const MAX_PROFILES = 3;

function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const empty = (): AppState => ({
  profiles: [],
  familyId: null,
  cachedEntitlements: [],
  pendingSyncKeys: [],
  abVariant: Math.random() < 0.5 ? 'A' : 'B',
  deviceId: newDeviceId(),
});

/** One-time `m-app.v1` -> `m-app.v2` migration (AD-13 §7): drops the retired unlock-code fields,
 *  keeps `profiles`/`abVariant`/`deviceId` verbatim (every pre-existing profile becomes a guest-
 *  import candidate at this device's first family login — see src/family/sync.ts). Storage
 *  itself may be blocked, same as every other read here, so a failure just falls through to an
 *  empty state rather than throwing. */
function migrateLegacyState(): AppState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw) as Partial<AppState> & { entitlements?: unknown; redeemedCode?: unknown; founder?: unknown };
    const migrated: AppState = {
      ...empty(),
      profiles: legacy.profiles ?? [],
      abVariant: legacy.abVariant ?? empty().abVariant,
      deviceId: legacy.deviceId ?? newDeviceId(),
    };
    localStorage.setItem(KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return null;
  }
}

/** Always succeeds: storage may be blocked (private mode, school device). */
export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return migrateLegacyState() ?? empty();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function save(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — the app must keep working for this session */
  }
}
