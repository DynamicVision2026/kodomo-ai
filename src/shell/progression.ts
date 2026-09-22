import type { DigPhase, Mission } from '../engine/types';
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

/** Every deepen move a mission's own dig content actually exercises, across every dig phase and
 *  layer it has (Story missions carry one dig phase; Bank Digs are dig-phase-only content with
 *  the same shape) — the "capability required to play it meaningfully" from WO-26 §5. */
function deepenMovesOf(mission: Mission): Set<string> {
  const moves = new Set<string>();
  for (const phase of mission.phases) {
    if (phase.template !== 'dig') continue;
    for (const layer of (phase as DigPhase).layers) {
      for (const card of layer.hand) {
        if (card.tag === 'deepen' && card.move) moves.add(card.move);
      }
    }
  }
  return moves;
}

/** 0-indexed position of Story 1-4 in `storyMissionsInOrder` — the Bank *section's* own earliest
 *  possible visibility (see `bankState`'s own doc comment). A per-bank prerequisite below this
 *  floor never actually matters, since Story completion is strictly sequential (`storyState`) —
 *  reaching Story 1-4 done already implies 1-1..1-3 are done too. */
const BANK_SECTION_FLOOR_INDEX = 3;

/**
 * Bank AVAILABLE/COMPLETED/LOCKED: the Architect's final correction on top of the Blueprint
 * Alignment Cleanup — the Bank section itself stays fully hidden until Story 1-4 is done (never
 * earlier), and once visible, each individual Bank Dig still resolves its own real prerequisite:
 * the LATEST Story that first introduces either (a) a deepen move the Bank requires, or (b) the
 * Bank's own rootType (めあて/しくみ/わかれ). This is the original WO-26 §5 derivation, with one
 * addition — its result is floored at Story 1-4 (`BANK_SECTION_FLOOR_INDEX`) rather than exposed
 * as early as a bank's derived prerequisite alone would allow.
 *
 * Against the current 8 Story Missions / 12 Bank Digs, this resolves to exactly two groups: the
 * 7 めあて Banks (derived prerequisite Story 1-3, floored up to Story 1-4 — the floor is what
 * actually binds for these) and the 5 わかれ Banks (derived prerequisite Story 1-5, from わかれ's
 * own first appearance at Story 1-5/minna — the floor is a no-op here, since 1-5 > 1-4). No Bank
 * is ever reachable before a Story has modeled its own rootType's reasoning shape.
 */
export function bankState(
  bank: Mission,
  storyMissionsInOrder: Mission[],
  progress: Record<string, Progress>,
): LocationState {
  if (progress[bank.id]?.done) return 'completed';
  // No Story spine supplied at all (a Bank-only harness/caller, e.g. an isolated Bank test) —
  // there is nothing to gate against, so the derived schedule simply doesn't apply here: fail
  // open, never lock content a caller never wired a Story sequence for in the first place.
  if (storyMissionsInOrder.length === 0) return 'available';

  const moveIntroducedAt = new Map<string, number>();
  const rootTypeIntroducedAt = new Map<string, number>();
  storyMissionsInOrder.forEach((story, index) => {
    for (const move of deepenMovesOf(story)) {
      if (!moveIntroducedAt.has(move)) moveIntroducedAt.set(move, index);
    }
    if (story.rootType && !rootTypeIntroducedAt.has(story.rootType)) {
      rootTypeIntroducedAt.set(story.rootType, index);
    }
  });

  const requiredIndices = [...deepenMovesOf(bank)]
    .map((move) => moveIntroducedAt.get(move))
    .filter((i): i is number => i !== undefined);
  const rootIndex = bank.rootType ? rootTypeIntroducedAt.get(bank.rootType) : undefined;
  if (rootIndex !== undefined) requiredIndices.push(rootIndex);

  const derivedIndex = requiredIndices.length > 0 ? Math.max(...requiredIndices) : 0;
  const floorIndex = Math.min(BANK_SECTION_FLOOR_INDEX, storyMissionsInOrder.length - 1);
  const gateIndex = Math.max(derivedIndex, floorIndex);
  const gateStory = storyMissionsInOrder[gateIndex]!;
  return progress[gateStory.id]?.done ? 'available' : 'locked';
}
