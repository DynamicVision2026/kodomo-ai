// Core content types. Mission content is DATA: the engine never imports a module by name.
// Spec v0.5 §7.

export type Stage = 1 | 2 | 3;

/** Follow-up card semantics in the dig phase. Only `deepen` advances a layer. */
export type DigTag = 'deepen' | 'sideways' | 'repeat' | 'offtopic';

/** Slot ids are declared per module in module.json, not hard-coded in the engine. */
export type SlotId = string;

/**
 * A v0.6 content domain. Kept as plain `string` (not a literal union) so the engine's own source
 * never embeds the approved Japanese domain vocabulary — gate:no-hardcoded-copy reserves that for
 * module JSON. The approved four-value enum is enforced at lint time; see pipeline/04_lint.ts.
 */
export type Domain = string;

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
  /**
   * Which follow-up move this card exercises (v0.6). Required on `deepen` cards in Stage-2
   * content — see `lintMission`. Free-form string: module.json's `followMoves` is the current
   * vocabulary, but this field isn't restricted to it by the schema.
   */
  move?: string;
  /** Content domain this card belongs to (v0.6). Required on `deepen` cards in Stage-2 content. */
  domain?: Domain;
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
  /**
   * The gap this layer is meant to open in the child (v0.6 content contract). Required on every
   * shipping Stage-2 Dig layer — see `lintMission`.
   */
  gap?: string;
}

export interface DigPhase {
  template: 'dig';
  layers: DigLayer[];
  root: { robotSays: string; claims: string[]; label: string };
}

export type Phase = SlotAssemblyPhase | DigPhase;

/**
 * Fixed, module-wide UI chrome (never mission-specific). Matches module.json's "ui" block.
 * Templates take this instead of individual string props so a new fixed string never means
 * touching every template's prop list — spec v0.5 §7: child-facing strings only in module JSON.
 */
export interface ModuleUiStrings {
  earlyOk: string;
  handoffPrompt: string;
  handoffContinue: string;
  handoffSkip: string;
  predictionSkip: string;
  profilePickTitle: string;
  profileCreateLabel: string;
  profileMaxReached: string;
  profileConfirm: string;
  coopQuestion: string;
  coopYes: string;
  coopSolo: string;
  teachbackSkip: string;
  parentScreenHeading: string;
  lockedMessage: string;
}

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
  /** Optional physical/household props referenced by this mission (v0.6). */
  props?: string[];
}
