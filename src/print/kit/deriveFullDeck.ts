import type { Mission, SlotAssemblyPhase } from '../../engine/types';
import type { DeckFile } from '../deck/PrintDeck';

type DeckCard = DeckFile['cards'][number];

/**
 * WO-20 Phase 7: derives what the full 45-card deck (spec v0.5 §8) CAN honestly contain today,
 * straight from real accepted/candidate course content — never inventing new child-facing text.
 * Every category below is populated only when a genuine, traceable source exists; everything
 * else is deliberately left empty rather than fabricated, and `checkDeckComposition`
 * (pipeline/lib/kitDeckComposition.ts) reports exactly which of the 45 slots are still missing.
 *
 * Populated now:
 *  - odai (up to 10): each mission/bank topic's own opening question — its slot-assembly "clear"
 *    card text for Story Missions, or its own `question` field for Bank topics (which have no
 *    slot-assembly phase to draw a card from).
 *  - follow-* (1 each, not yet 3 each): module.json's own `moveRealizations` — the one canonical,
 *    already-accepted phrasing per move. The spec's "3 each" implies additional phrased variants
 *    that don't exist as accepted content yet; inventing two more per move would be new content
 *    authoring, not derivation, so those 8 remaining slots stay unpopulated.
 *  - blank (2): by definition require no source content at all — always deterministically ready.
 *
 * Deliberately NOT populated (no genuine source exists anywhere in the repository):
 *  - what/why/who/format core slots beyond "what" (no mission has ever used why/who/format).
 *  - ひみつ (traps) — no engine or content concept of a "trap" card exists anywhere (confirmed
 *    by WO-19's own repository search).
 *  - ロボのリアクション / あそびかた — reusable, genuinely topic-agnostic wording exists in the
 *    engine's reply text, but selecting and re-authoring it as standalone printable cards is a
 *    content decision, not a mechanical derivation; left for a future content pass.
 */

export interface DeriveDeckInput {
  storyMissions: Mission[];
  bankTopics: Mission[];
  moveRealizations: Record<string, string>;
}

let nextId = 0;
function card(kind: string, text: string): DeckCard {
  return { id: `derived-${kind}-${nextId++}`, kind, text };
}

/** The opening question for one topic — a Story Mission's own slot-assembly "clear" card, or a
 *  Bank topic's own top-level `question` field (Bank topics have no slot-assembly phase). */
function openingQuestion(mission: Mission): string {
  const first = mission.phases[0]!;
  if (first.template === 'slot-assembly') {
    const clear = (first as SlotAssemblyPhase).cards.find((c) => c.tag === 'clear');
    if (clear) return clear.text;
  }
  // Bank topics: the dig phase's own opening layer IS the question being explored — its title
  // (the accepted, already-published mission title) is the closest genuine "おだい" phrasing.
  return mission.title;
}

export function deriveFullDeck({ storyMissions, bankTopics, moveRealizations }: DeriveDeckInput): DeckCard[] {
  nextId = 0;
  const cards: DeckCard[] = [];

  // おだい: up to 10, drawn from real topics — Story Missions first (fewer, higher-signal),
  // then Bank topics, capped at 10 (spec v0.5 §8's own count) without over- or under-claiming.
  const odaiSources = [...storyMissions, ...bankTopics].slice(0, 10);
  for (const m of odaiSources) cards.push(card('odai', openingQuestion(m)));

  // 追問カード: one real, already-accepted card per move (not yet 3 each — see module doc above).
  for (const [move, text] of Object.entries(moveRealizations)) cards.push(card(move, text));

  // blank: no source content needed — always genuinely complete.
  cards.push(card('blank', ''));
  cards.push(card('blank', ''));

  return cards;
}
