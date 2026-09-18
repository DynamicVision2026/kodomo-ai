// Core content types. Mission content is DATA: the engine never imports a module by name.
// Spec v0.5 §7.

export type Stage = 1 | 2 | 3;

/** Follow-up card semantics in the dig phase. Only `deepen` advances a layer. */
export type DigTag = 'deepen' | 'sideways' | 'repeat' | 'offtopic';

/** Slot ids are declared per module in module.json, not hard-coded in the engine. */
export type SlotId = string;

export interface SlotCard {
  id: string;
  slot: SlotId;
  /** Ruby markup: {漢字|かんじ} */
  text: string;
  /** Tag the resolver matches on — never the card id. */
  tag: string;
}

export interface Archetype {
  robotSays: string;
  animation?: string;
  tip?: string;
  /** Claim ids from facts.yaml, or ['nonfactual'] for flavour text. */
  claims: string[];
}

export interface SlotRule {
  /** slot -> required tag, '*' matches anything, 'missing' matches an empty slot */
  when: Record<SlotId, string>;
  archetype: string;
}

export interface PredictionPrompt {
  beforeRound: number;
  options: string[];
}

export interface SlotAssemblyPhase {
  template: 'slot-assembly';
  slots: SlotId[];
  cards: SlotCard[];
  rules: SlotRule[];
  archetypes: Record<string, Archetype>;
  predictions?: PredictionPrompt[];
}

export interface DigCard {
  id: string;
  text: string;
  tag: DigTag;
}

export interface DigLayer {
  /** ロボ's answer that OPENS this layer. */
  robotSays: string;
  claims: string[];
  hand: DigCard[];
  /** Flat replies for non-advancing cards. */
  replies: Partial<Record<Exclude<DigTag, 'deepen'>, string>>;
  /** Challenge shown if the player taps 「これでOK」 here. */
  earlyOk?: { challenger: string; asks: string };
  prediction?: PredictionPrompt;
}

export interface DigPhase {
  template: 'dig';
  layers: DigLayer[];
  root: { robotSays: string; claims: string[]; label: string };
}

export type Phase = SlotAssemblyPhase | DigPhase;

export interface Mission {
  id: string;
  stage: Stage;
  title: string;
  /** facts.yaml claim references backing this mission. Checked by gate:claims. */
  sources: string[];
  /** Native-speaker review stamp. Checked by gate:claims. */
  review?: { by: string; date: string };
  phases: Phase[];
  /** Post-mission wrapper screens. */
  tip: string;
  teachBack: string;
  ouchiTalk: string;
}
