import type { Stage } from './types';
import type { MoveProgressMap } from './scaffold';
import type { MilestoneMap, M2Evidence, MemoryMomentMap } from './milestones';

/**
 * Local, per-device state. NO PII: preset avatar + preset nickname id + a stage number.
 * Never a grade, birthday, name, school or free text. Spec v0.5 §7.
 */
const KEY = 'm-app.v1'; // brand-neutral: the product name may still change

export interface Progress { done: boolean; stamps: number; coop: boolean }
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
  entitlements: string[];
  founder: boolean;
  abVariant: 'A' | 'B';
  /** Opaque, non-PII, per-device id — never a person's identity. Only used to count
   *  activations against a family code's soft device cap (backend/src/handlers/unlock.ts);
   *  never sent anywhere except that one redemption call. */
  deviceId: string;
}

export const MAX_PROFILES = 6;

function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const empty = (): AppState => ({
  profiles: [],
  entitlements: ['m1:free'],
  founder: false,
  abVariant: Math.random() < 0.5 ? 'A' : 'B',
  deviceId: newDeviceId(),
});

/** Always succeeds: storage may be blocked (private mode, school device). */
export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
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
