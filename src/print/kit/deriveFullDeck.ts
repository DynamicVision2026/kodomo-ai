import type { Mission, SlotAssemblyPhase, DigPhase, DigTag } from '../../engine/types';
import type { DeckFile } from '../deck/PrintDeck';
import printContent from '../kit-data/deck-print-content.json';

type DeckCard = DeckFile['cards'][number];

/**
 * WO-20 Phase 7 / WO-21 Phase 2: derives the full 45-card deck (spec v0.5 §8) straight from real
 * accepted/candidate course content wherever a genuine source exists, and — for the print-only
 * categories no digital mission has ever used (the core slots' own blank card aside, ひみつ
 * traps, ロボのリアクション, あそびかた rules) — from a small amount of new, deliberately
 * topic-agnostic print-only content. That content is never a hardcoded string in this file (CI
 * gate 3): it lives in `../kit-data/deck-print-content.json`, same as every other child-facing
 * string in this product. Nothing below is a placeholder: every card either carries real derived
 * text or a genuine, honest invitation to write one's own (the physical deck's own "2 pre-filled
 * + 1 blank each" design, spec v0.5 §8), never an empty string standing in for missing content.
 *
 * Populated:
 *  - odai (10): each mission/bank topic's own opening question (unchanged from WO-20 Phase 7).
 *  - follow-* (3 each): module.json's own canonical `moveRealizations` phrasing, plus 2
 *    additional accepted-vocabulary phrasings per move — matching the game's own instruction to
 *    ask the follow-up in the player's own words (spec v0.5 §8's ほりさげゲーム description).
 *  - what/why/who/format (3 each = the accepted "2 pre-filled + 1 blank" split, spec v0.5 §8):
 *    2 print-only question-building prompts per the accepted Stage-2 core-slot vocabulary
 *    (なにを/なぜ/だれに/どんな形で, spec v0.5's Stage-2 rule table) + 1 genuine write-your-own
 *    card — never a second, invented mechanic.
 *  - himitsu (4): print-only privacy-as-reflex reminder cards (spec v0.5's alignment table names
 *    ひみつカード traps as the product's 情報活用能力/情報モラル alignment point), each a short,
 *    positively framed habit reminder, never a scare tactic.
 *  - reaction (3): DERIVED, not invented — the single most common authored `replies` text per
 *    dig tag (repeat/sideways/offtopic) across every real Story Mission + Bank topic supplied.
 *    These already exist as real, already-lint-passed mission content; this just surfaces the
 *    de facto standard phrasing as its own printable card.
 *  - rules (2): print-only, adapted directly from spec v0.5 §8's own accepted ほりさげゲーム
 *    paragraph — not new game design, a transcription of it onto 2 cards.
 *  - blank (2): a genuine write-your-own invitation, same as the core slots' own blank card —
 *    never empty text (an empty card is not a placeholder to fill in later; it's how a printed
 *    blank card is supposed to read).
 */

export interface DeriveDeckInput {
  storyMissions: Mission[];
  bankTopics: Mission[];
  moveRealizations: Record<string, string>;
}

const WRITE_YOUR_OWN: string = printContent.writeYourOwn;
const FOLLOW_VARIANTS: Record<string, string[]> = printContent.followVariants;
const CORE_SLOT_PROMPTS: Record<string, string[]> = printContent.coreSlotPrompts;
const HIMITSU_CARDS: string[] = printContent.himitsuCards;
const RULES_CARDS: string[] = printContent.rulesCards;

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
  // (the accepted, already-published mission title) is the closest genuine おだい phrasing.
  return mission.title;
}

/** The single most common real `replies` text authored for `tag` across every dig layer in
 *  every mission supplied — deterministic (stable Map iteration order over a fixed input list),
 *  and always a real, already-lint-passed mission string, never invented. Returns null only if
 *  no mission supplies any reply for that tag at all. */
function mostCommonReply(missions: Mission[], tag: Exclude<DigTag, 'deepen'>): string | null {
  const counts = new Map<string, number>();
  for (const mission of missions) {
    for (const phase of mission.phases) {
      if (phase.template !== 'dig') continue;
      for (const layer of (phase as DigPhase).layers) {
        const text = layer.replies?.[tag];
        if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
      }
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [text, count] of counts) {
    if (count > bestCount) { best = text; bestCount = count; }
  }
  return best;
}

export function deriveFullDeck({ storyMissions, bankTopics, moveRealizations }: DeriveDeckInput): DeckCard[] {
  nextId = 0;
  const cards: DeckCard[] = [];
  const allMissions = [...storyMissions, ...bankTopics];

  // おだい: up to 10, drawn from real topics — Story Missions first (fewer, higher-signal),
  // then Bank topics, capped at 10 (spec v0.5 §8's own count) without over- or under-claiming.
  const odaiSources = allMissions.slice(0, 10);
  for (const m of odaiSources) cards.push(card('odai', openingQuestion(m)));

  // 追問カード: the canonical accepted phrasing + 2 further accepted-vocabulary phrasings, 3 per
  // move (spec v0.5 §8).
  for (const [move, text] of Object.entries(moveRealizations)) {
    cards.push(card(move, text));
    for (const variant of FOLLOW_VARIANTS[move] ?? []) cards.push(card(move, variant));
  }

  // Core slots (なにを/なぜ/だれに/どんな形で): 2 prompts + 1 write-your-own each.
  for (const [slot, prompts] of Object.entries(CORE_SLOT_PROMPTS)) {
    for (const text of prompts) cards.push(card(slot, text));
    cards.push(card(slot, WRITE_YOUR_OWN));
  }

  // ひみつ: 4 print-only privacy-as-reflex reminders.
  for (const text of HIMITSU_CARDS) cards.push(card('himitsu', text));

  // ロボのリアクション: the real, already-accepted majority reply per dig tag.
  for (const tag of ['repeat', 'offtopic', 'sideways'] as const) {
    const text = mostCommonReply(allMissions, tag);
    if (text) cards.push(card('reaction', text));
  }

  // あそびかた: adapted from spec v0.5 §8's own accepted rules paragraph.
  for (const text of RULES_CARDS) cards.push(card('rules', text));

  // blank: a genuine write-your-own invitation, not empty text.
  cards.push(card('blank', WRITE_YOUR_OWN));
  cards.push(card('blank', WRITE_YOUR_OWN));

  return cards;
}
