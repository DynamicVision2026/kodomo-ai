import type { DigPhase, Mission } from '../engine/types';
import type { Progress } from '../engine/storage';

/**
 * WO-26 §7: the four deterministic location states every Story/Bank must resolve to. `available`
 * only ever applies to Bank Digs (a free-pick side tunnel) — a Story Mission resolves to
 * `current`/`completed`/`locked` only, since it is never freely enterable ahead of `current`
 * (§3.1: "Story Missions MUST NOT be freely skipped").
 */
export type LocationState = 'current' | 'available' | 'completed' | 'locked';

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

/**
 * Bank AVAILABLE/COMPLETED/LOCKED (WO-26 §5): a Bank Dig unlocks only once the LATEST Story
 * Mission that first introduces either (a) a deepen move this Bank Dig requires, or (b) this
 * Bank Dig's own root type (rootType — めあて/しくみ/わかれ), has itself been COMPLETED — never
 * earlier ("a Bank Dig may unlock only after the child has been introduced to the capability
 * required to play it meaningfully").
 *
 * Purely derived from each Story Mission's own authored dig content and rootType metadata —
 * never a hand-picked B01-B12 grouping — so a future change to the Story spine's own content
 * re-derives the unlock schedule automatically instead of drifting from a stale hardcoded table.
 * See docs/WO-26 completion report, "BANK UNLOCK ASSUMPTIONS", for the worked-out schedule this
 * produces against the current 8 Story Missions / 12 Bank Digs.
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

  const requiredIndex = requiredIndices.length > 0 ? Math.max(...requiredIndices) : 0;
  const requiredStory = storyMissionsInOrder[requiredIndex]!;
  return progress[requiredStory.id]?.done ? 'available' : 'locked';
}
