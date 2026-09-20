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

/** AD-01: the two permitted forms a gap distractor may take. */
export type GapDistractorKind = 'answered' | 'other-layer';

/** AD-01: an authored, plausible-but-wrong alternative to a layer's target `gap`. */
export interface GapDistractor {
  text: string;
  kind: GapDistractorKind;
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
  /**
   * AD-01 (WO-03): exactly two authored distractor gaps, one `answered` and one `other-layer`,
   * presented alongside `gap` in Gap Naming. Required wherever `gap` is required — see
   * `lintMission`.
   */
  gapDistractors?: [GapDistractor, GapDistractor];
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
  /** WO-02: the 「これでOK？」 judgment gate's "not enough" response, opposite of earlyOk. */
  judgeNotEnough: string;
  /** WO-05: heading for 問いのどうぐばこ, the Toolbox growth surface on the parent screen. */
  toolboxHeading: string;
  /** WO-07: Blind-first's commit button — 「いえた」, tapped while the hand is still hidden. */
  blindCommit: string;
  /** WO-07: blind_selfreport option — the child's own question was the same as an authored card. */
  blindSelfReportSame: string;
  /** WO-07: blind_selfreport option — the child thought of something better than any authored card. */
  blindSelfReportBetter: string;
  /** WO-07: blind_selfreport option — the child's own question differed from the authored cards. */
  blindSelfReportDifferent: string;
  /** WO-14: the parent screen's M2b prompt — asks the parent to confirm, from their own
   *  observation, that the child independently said why the robot's first answer wasn't enough.
   *  This is the only thing that can award milestones.M2; M2a proxy evidence never can. */
  m2ConfirmPrompt: string;
  /** WO-14: the M2b confirmation button. Its label is the parent's own attestation ("yes, they
   *  could say that"), never a claim that the software measured or verified anything. */
  m2ConfirmAction: string;
  /** WO-14: shown in place of the prompt/button once M2b has been confirmed — monotonic, no
   *  "undo". Plain confirmation text, not a badge or score. */
  m2ConfirmedMessage: string;
  /** WO-19: the parent screen's M0 (封をする, the Day-1 envelope moment) prompt, shown once,
   *  the first time a profile reaches the parent screen without M0 already achieved. */
  m0Prompt: string;
  /** WO-19: the M0 envelope-seal button's label — the family's one explicit tap. */
  m0Action: string;
  /** WO-19: shown in place of the prompt/button once M0 has been sealed — monotonic, no "undo",
   *  same pattern as `m2ConfirmedMessage`. */
  m0SealedMessage: string;
  /** WO-19: the parent screen's M5 (そとで つかった) prompt, explaining that tapping a move
   *  below records a real-world observation of that move being used outside an authored
   *  mission — never a judgment of correctness. Always shown (not gated on M5 achievement),
   *  since a parent may record outside use for more than one move over multiple visits. */
  m5Prompt: string;
  /** WO-19 Phase 3B — the "Parent Unknown" pattern: shown only at the parent's own turn inside
   *  every よそうバトル (Prediction Battle), reassuring them explicitly that they do not need to
   *  know the right answer — a co-learner making a guess alongside the child, not the authority
   *  checking one. One fixed UI-chrome string, reused by every prediction battle in every
   *  mission (never mission-specific content), so this capability is automatically complete for
   *  every current and future mission without per-mission authoring. */
  predictionParentPrompt: string;
}

/**
 * WO-11 decision 2 (the Founder's numbered ticket decision — not a section of any AD-02 document
 * present in this repository, see docs/WO-11-implementation-notes-content-classification.md):
 * the three accepted root types a commissioned topic's ねっこ resolves into — しくみ / めあて /
 * わかれ. No quotas across them — a topic is whichever one fits, not filled to a ratio.
 *
 * Kept as plain `string` here (not a literal union), matching `Domain` above and for the same
 * reason: gate:no-hardcoded-copy reserves child-facing/content-vocabulary Japanese string
 * literals for module JSON, never engine source. The closed three-value set is declared and
 * enforced instead in scripts/lib/rootType.ts (outside that gate's scan root) and checked by
 * scripts/lib/moduleClassification.ts's checkMissions() — see tests/rootType.test.ts for the
 * adversarial proof that a fourth value is rejected. Not yet read or branched on anywhere in the
 * engine; recorded here so the next content ticket (C-03) has one typed contract instead of
 * inventing its own.
 */
export type RootType = string;

/** WO-11 decisions 4-5: the same three-way release-content classification scripts/lib/
 *  moduleClassification.ts enforces at the gate level, duplicated here (not imported — pipeline/
 *  scripts tooling and the Vite-bundled engine are deliberately independent layers) purely so
 *  Mission's own shape matches what every mission JSON actually carries. The engine itself never
 *  reads or branches on this field. */
export type ContentClass = 'release' | 'synthetic' | 'archived';

export interface Mission {
  id: string;
  /** WO-11 — see ContentClass. Required on every mission file (enforced by gate:claims, not by
   *  this type); optional here only because engine-side consumers must not depend on its
   *  presence at runtime — this field governs release/CI concerns, not gameplay. */
  contentClass?: ContentClass;
  /** WO-11 decision 2 — see RootType. Not yet authored on any existing mission; optional until
   *  C-03 (or a later ticket) actually sets it. */
  rootType?: RootType;
  stage: Stage;
  title: string;
  /** facts.yaml claim references backing this mission. Checked by gate:claims. */
  sources: string[];
  /** Native-speaker review stamp. Checked by gate:claims. `note` (WO-14 final correction) is an
   *  optional free-text annotation on the review's own scope — e.g. "register-only re-review" —
   *  never read or branched on by any gate; it exists purely as a human-readable record of what
   *  was (and wasn't) re-reviewed. */
  review?: { by: string; date: string; note?: string };
  /**
   * WO-21 Phase 0: an explicit, honest record that the Founder has chosen to waive the separate
   * native-speaker (酒井先生) Gate 2 round as a BLOCKING step for this release cycle — never a
   * substitute for, or a claim of, an actual native review. `review` (above) still means exactly
   * what it always has (a real native-speaker stamp); this field is structurally distinct and
   * gate:claims (scripts/lib/moduleClassification.ts) only ever accepts EITHER a real `review.by`
   * OR this explicit waiver in RELEASE=1 mode, never inferring one from the other. Absent on
   * every mission that hasn't had this decision made for it.
   */
  gate2Waiver?: { waivedBy: string; waivedAt: string; reason: string };
  phases: Phase[];
  /** Post-mission wrapper screens. */
  tip: string;
  teachBack: string;
  ouchiTalk: string;
  /** Optional physical/household props referenced by this mission (v0.6). */
  props?: string[];
  /**
   * WO-19 Phase 3C — one optional perspective-shift moment: a second character's plausible,
   * different way of seeing the SAME situation the mission just explored, offered for the child
   * to notice — never a debate, never scored, never "who is right". Shown (when present) as its
   * own wrapper screen after おうちトーク and before handoff, using the exact same rendering
   * idiom as tip/teachBack/ouchiTalk. Absent on every mission that hasn't been authored with one
   * yet (all current release missions) — MissionShell skips straight past it when absent, so
   * this is purely additive and changes no existing mission's flow.
   */
  perspective?: { voice: string; text: string };
}
