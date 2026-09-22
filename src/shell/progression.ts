import type { Mission } from '../engine/types';
import type { Progress } from '../engine/storage';

/**
 * WO-26 §7: the four deterministic location states every Story/Bank must resolve to. `available`
 * only ever applies to Bank Digs (a free-pick side tunnel) — a Story Mission resolves to
 * `current`/`completed`/`locked` only, since it is never freely enterable ahead of `current`
 * (§3.1: "Story Missions MUST NOT be freely skipped").
 */
export type LocationState = 'current' | 'available' | 'completed' | 'locked';

/**
 * Story CURRENT/COMPLETED/LOCKED (WO-26 §3.1/§7): sequential, mirroring `pickNextMission`'s own
 * "first undone mission at this stage" rule — a Story ahead of CURRENT is LOCKED, never freely
 * enterable, regardless of entitlement. Entitlement (`hasAccess`) is a separate, still-unchanged
 * concern layered on top once a Story is actually selected.
 */
export function storyState(
  missionId: string,
  progress: Record<string, Progress>,
  currentMissionId: string,
): LocationState {
  if (progress[missionId]?.done) return 'completed';
  return missionId === currentMissionId ? 'current' : 'locked';
}

/** 0-indexed position of Story 1-4 in `storyMissionsInOrder` — the single frozen Bank-unlock
 *  gate (see `bankState`'s own doc comment). */
const BANK_GATE_STORY_INDEX = 3;

/**
 * Bank AVAILABLE/COMPLETED/LOCKED: frozen product decision (Blueprint Alignment Cleanup, per
 * the Module 1 Closed-Loop Truth Map) — all 12 Bank Digs are Transfer Practices, not additional
 * mandatory main lessons, and unlock TOGETHER once Story 1-4 (the 4th Story Mission in sequence)
 * is COMPLETED. Never earlier, and never staggered by individual content (no more per-move/
 * rootType-derived schedule, which used to open 7 Banks after Story 1-3 and the remaining 5
 * after Story 1-5 — that two-tier schedule is obsolete).
 */
export function bankState(
  bank: Mission,
  storyMissionsInOrder: Mission[],
  progress: Record<string, Progress>,
): LocationState {
  if (progress[bank.id]?.done) return 'completed';
  // No Story spine supplied at all (a Bank-only harness/caller, e.g. an isolated Bank test) —
  // there is nothing to gate against, so the gate simply doesn't apply here: fail open, never
  // lock content a caller never wired a Story sequence for in the first place.
  if (storyMissionsInOrder.length === 0) return 'available';

  const gateIndex = Math.min(BANK_GATE_STORY_INDEX, storyMissionsInOrder.length - 1);
  const gateStory = storyMissionsInOrder[gateIndex]!;
  return progress[gateStory.id]?.done ? 'available' : 'locked';
}
