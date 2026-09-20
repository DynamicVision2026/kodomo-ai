import { isAtLeast, type MoveProgressMap } from './scaffold';

/**
 * WO-08: deterministic milestone and memory-moment foundation. Records a small number of
 * meaningful, durable, first-occurrence facts — never a score, streak, percentage, rank, or
 * calendar-driven award. Execution Handoff v2 / WO-08, R10-R11.
 *
 * M0-M5 are the accepted Stage-2 milestone identities. This module implements only the
 * transitions with existing authoritative evidence:
 *  - M1 (どうぐが 手に入った): derived read-only from moveProgress reaching moratta.
 *  - M2a (system proxy): evidence only, tracked separately in `M2Evidence` — can NEVER set
 *    milestones.M2 itself. See `hasM2Proxy`.
 *  - M2 / M2b (actual): requires a parent-confirmation event this ticket does not build a UX
 *    for. `applyM2Confirmed` exists as the clean seam a later ticket's confirmation UI calls;
 *    nothing in this codebase invokes it yet.
 *  - M3 (3れん ホリ): a Dig phase completed with a genuine 3+ authored layer chain — the
 *    engine's own layer count, deterministic, already what digMachine's depth() counts from.
 *  - M4 (カードなしで きけた): the first blind_commit (WO-07) — already fully authoritative.
 *
 * M0 (封をする — a Day-1 baseline-question envelope) and M5 (そとで つかった — parent-logged
 * outside use) are representable identities only. No function here ever sets them: M0 needs an
 * envelope-capture interaction and M5 needs a parent outside-use log, and neither interaction
 * exists in the accepted product yet.
 */
export type MilestoneId = 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5';

export interface MilestoneState {
  achieved: boolean;
  /** Epoch ms. Set once, on the transition to achieved=true, and never overwritten again. */
  achievedAt: number | null;
}

export type MilestoneMap = Partial<Record<MilestoneId, MilestoneState>>;

function stateOf(map: MilestoneMap, id: MilestoneId): MilestoneState {
  return map[id] ?? { achieved: false, achievedAt: null };
}

/** Monotonic and idempotent: a milestone, once achieved, is never re-awarded or timestamped
 *  again — repeated qualifying evidence has no further effect. */
function achieve(map: MilestoneMap, id: MilestoneId, now: number): MilestoneMap {
  const current = stateOf(map, id);
  if (current.achieved) return map;
  return { ...map, [id]: { achieved: true, achievedAt: now } };
}

/**
 * M1: at least one follow-up move has been obtained (moratta or beyond) for this profile.
 * Purely derived from the existing moveProgress — no new evidence hook needed. Call this after
 * any moveProgress change; it is a no-op once already achieved or while nothing yet qualifies.
 */
export function evaluateM1(milestones: MilestoneMap, moveProgress: MoveProgressMap, now: number): MilestoneMap {
  const anyObtained = Object.values(moveProgress).some((p) => isAtLeast(p.rung, 'moratta'));
  return anyObtained ? achieve(milestones, 'M1', now) : milestones;
}

/**
 * M3: a Dig phase was just completed (reached its root) with `layerCount` authored layers.
 * 3れん ホリ means a genuine three-step chain — bread, the only shipped Stage-2 mission today,
 * has 2 layers, so this is unreachable until a 3+-layer mission ships. The mechanism itself is
 * fully deterministic and tested independently of that content gap.
 */
export function evaluateM3(milestones: MilestoneMap, layerCount: number, now: number): MilestoneMap {
  return layerCount >= 3 ? achieve(milestones, 'M3', now) : milestones;
}

/**
 * M4: the first blind_commit (WO-07) has occurred. The caller invokes this only from an actual
 * commit event, never merely because Blind-first was displayed — evaluateM4 itself is
 * unconditional (there's nothing left to check; a call IS the qualifying evidence).
 */
export function evaluateM4(milestones: MilestoneMap, now: number): MilestoneMap {
  return achieve(milestones, 'M4', now);
}

/**
 * M2b — the actual milestone. This function is the clean seam a later ticket's parent-
 * confirmation UI will call once it exists; nothing in WO-08 invokes it.
 */
export function applyM2Confirmed(milestones: MilestoneMap, now: number): MilestoneMap {
  return achieve(milestones, 'M2', now);
}

/**
 * M2a — system-observable proxy evidence only (Critical M2 distinction). Recorded when the
 * child judged an answer "not enough" and named a gap (WO-03's Gap Naming) before playing the
 * next follow-up — which is exactly what happens whenever Gap Naming resolves in Dig. Tracks
 * DISTINCT mission ids only; repeated evidence within the same mission adds nothing. This can
 * accumulate freely but must never, by itself, satisfy `milestones.M2` — only
 * `applyM2Confirmed` (an actual parent confirmation) can do that.
 */
export interface M2Evidence {
  proxyMissionIds: string[];
}

export function addM2ProxyMission(evidence: M2Evidence, missionId: string): M2Evidence {
  if (evidence.proxyMissionIds.includes(missionId)) return evidence;
  return { proxyMissionIds: [...evidence.proxyMissionIds, missionId] };
}

/** Whether M2a's two-distinct-mission proxy threshold has been met. Evidence/readiness only —
 *  no code path in this repository passes this into `achieve('M2', ...)`. */
export function hasM2Proxy(evidence: M2Evidence): boolean {
  return evidence.proxyMissionIds.length >= 2;
}

// --- Memory moments ---------------------------------------------------------------------------

export type MemoryMomentKind =
  | 'first_three_chain'
  | 'first_blind_commit'
  // Representable per WO-08's required kind list, but no function in this module ever records
  // one of these: no authoritative evidence exists yet for a move-to-"evidence"/"perspective"
  // classification, or for outside-use / household-adult logging. See the WO-08 return report's
  // dependency matrix for what each is waiting on.
  | 'first_evidence_question'
  | 'first_perspective_question'
  | 'outside_use'
  | 'household_adult_unknown';

export interface MemoryMoment {
  kind: MemoryMomentKind;
  /** Epoch ms, set once and never overwritten — "dated, first-occurrence" per WO-08. */
  recordedAt: number;
  missionId?: string;
}

export type MemoryMomentMap = Partial<Record<MemoryMomentKind, MemoryMoment>>;

/** Records `kind` once, durably. A repeat call is a no-op: first-occurrence only, never
 *  overwritten, never duplicated. */
function recordMemory(map: MemoryMomentMap, kind: MemoryMomentKind, now: number, missionId?: string): MemoryMomentMap {
  if (map[kind]) return map;
  return { ...map, [kind]: { kind, recordedAt: now, missionId } };
}

/** Shares its qualifying evidence with M3 — see `evaluateM3`. */
export function recordFirstThreeChain(map: MemoryMomentMap, now: number, missionId: string): MemoryMomentMap {
  return recordMemory(map, 'first_three_chain', now, missionId);
}

/** Shares its qualifying evidence with M4 — see `evaluateM4`. */
export function recordFirstBlindCommit(map: MemoryMomentMap, now: number, missionId: string): MemoryMomentMap {
  return recordMemory(map, 'first_blind_commit', now, missionId);
}
