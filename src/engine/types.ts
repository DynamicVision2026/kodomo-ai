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
  /** WO-28 §6: an optional line under the parent heading communicating "これは親のテストでは
   *  ありません" — a co-player, not an examiner. Optional so existing module fixtures without it
   *  keep working unchanged; when present, MissionShell renders it right under the heading. */
  parentReassuranceLine?: string;
  /** WO-30 §6: an optional purchase-recovery link shown on the parent dashboard, only while the
   *  module itself is still unentitled on this device — "already bought it on another device?
   *  here's where to re-enter your code" (/play/unlock, the existing multi-device redemption
   *  screen — device changes/cleared storage are exactly what its soft device cap already
   *  supports, no new backend surface). Optional so existing module fixtures keep working
   *  unchanged; hidden entirely (never shown as a dead/mismatched link) once the module IS
   *  entitled on this device. */
  parentUnlockPrompt?: string;
  parentUnlockLinkLabel?: string;
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
  /** WO-21 Phase 1: heading for the Bank selection screen — the free-pick list of short Bank
   *  Digs (AD-04), reached from the parent screen, never a score/leaderboard/ranking surface. */
  bankHeading: string;
  /** WO-21 Phase 1: the parent screen's button into the Bank selection screen. Always shown
   *  when a bank library was supplied, whether or not the just-played mission was itself a
   *  Bank Dig — the Bank is reachable from any session's end, per spec's "pick in any order". */
  bankHubButton: string;
  /** WO-21 Phase 1: the Bank selection screen's own way back to the parent screen — plain
   *  navigation, not a milestone or evidence event. */
  bankBackButton: string;
  /** WO-21 Phase 1: shown next to a Bank topic the active profile has already played through —
   *  a plain completion marker (matches `progress[id].done`), never a score or correctness
   *  claim. */
  bankDoneLabel: string;

  // --- WO-23 (AD-06 v0.7a): continuation contract, Course Home, Mission Complete -------------
  /** WP-1: shown whenever a played card was non-advancing (sideways/repeat/offtopic) — the
   *  hand was already still open and clickable (digMachine.ts never closes it), but nothing
   *  said so explicitly. This is that explicit continuation cue — never a "wrong answer"
   *  label, just "the hand is still here, try another card." */
  digContinuePrompt: string;
  /** Course Home's own primary CTA into the active profile's current (next-undone) mission. */
  courseHomeContinueLabel: string;
  /** Course Home's heading. */
  courseHomeHeading: string;
  /** Course Home's Bank section label — AD-06 D4's "ちかみち" (side tunnels off the main shaft). */
  courseHomeBankLabel: string;
  /** Course Home's growth/tools section label — AD-06 D4's "あつめたもの". */
  courseHomeGrowthLabel: string;
  /** Course Home's Home Kit entry label. */
  courseHomeKitLabel: string;
  /** Shown next to a depth (Story Mission) the active profile has already completed — a plain
   *  completion marker, never a score, matching `bankDoneLabel`'s own convention. */
  courseHomeDoneLabel: string;
  /** Shown on a depth ahead of the current one — AD-06 D2/D4: "not dug yet", never a
   *  denial/dead-end message. */
  courseHomeNotYetLabel: string;
  /** Mission Complete screen heading. */
  completeHeading: string;
  /** Mission Complete: label introducing the tool(s) practiced this mission. */
  completeToolLabel: string;
  /** Mission Complete: shown when no further mission is undone — the course itself is complete,
   *  never phrased as a dead end. */
  completeCourseFinishedLabel: string;
  /** Mission Complete's primary CTA — the next undone mission. */
  completeNextMissionLabel: string;
  /** Mission Complete's secondary CTA — back to Course Home. */
  completeBackToMapLabel: string;
  /** Mission Complete's optional third action — try it outside, at home. */
  completeTryOutsideLabel: string;

  // --- WO-24 (AD-07 v0.7a prototype): Mission 1 continuous scene, verb D (わたす) copy ---------
  /** Stage's own handoff prompt — the ONE thing the child sees during a full-screen context
   *  switch to the parent, distinct from the shared `handoffPrompt` used by PredictionBattle's
   *  own mid-round handoff (unchanged) and every other mission's end-of-mission handoff screen
   *  (also unchanged). Mission-1-Stage-only. */
  stageHandoffPrompt: string;
  /** Stage's own single handoff action — "I gave it to them." No skip button sits beside it
   *  (AD-07 §4D: "Child sees only... and one action"); solo play never reaches this screen at
   *  all (MissionShell skips straight to the parent screen for Mission 1 in solo mode). */
  stageHandoffGiven: string;
  /** Stage's own return-to-child action, replacing the generic `completeNextMissionLabel`-
   *  adjacent `handoffContinue` label on the parent screen's own advance-to-Mission-Complete
   *  button, for Mission 1 only. */
  stageReturnToChild: string;
  /** AD-07 §10: Pon太's own gentle ~12s JUDGE stall nudge — never a pointer toward either
   *  answer, just an invitation to keep thinking. Mission-1-Stage-only. */
  stageJudgeStallPrompt: string;
  // The robot's own speaker name, shown above its dialogue bubbles in the Stage. The
  // challenger character's own name already comes from the mission's own authored content
  // (DigLayer.earlyOk.challenger); the robot has no such field, so its name is fixed UI
  // chrome here instead (CI gate 3: no child-facing string lives in component code).
  stageRobotName: string;
  // AD-07 beat 13: the large, non-dialogue きょうのコツ moment's one permitted generic
  // continuation action — the sole surviving つぎへ, everywhere else replaced by tap-to-read.
  stageNextLabel: string;
  // AD-07 beat 15: the parent's own dedicated teach-back attestation, distinct from
  // handoffContinue/m2ConfirmAction — never reused for anything else.
  stageParentGotItLabel: string;
  // WO-25 #2: names the GAP-naming decision explicitly — L2 context sitting above the choice
  // group (the group itself stays the single L1). Fixes the audit's "child could infer the
  // task, but the interface never named it" finding.
  stageGapPrompt: string;
  // WO-25 #2: names the question/hand-selection decision explicitly, same L2 role. Reused for
  // both the very first question choice and every dig-layer hand.
  stageQuestionPrompt: string;
  // WO-25 #5: the explicit "you found it" label at ROOT — discovery itself is the reward, never
  // a score/star/streak. Shown alongside the root's own reveal motion, before 今日のコツ.
  stageRootDiscoveryLabel: string;
  // WO-25B (G8): names the parent's own task during a mid-mission prediction battle — what the
  // existing ui.predictionParentPrompt reassurance never states on its own.
  stagePredictionParentTask: string;
  // WO-25B (G8): the explicit "give the device back" prompt shown after the parent's own pick,
  // before any child-facing control reappears — paired with the existing stageReturnToChild
  // ("こどもに もどす") as its one action, reused rather than duplicated.
  stageHandbackPrompt: string;

  // --- WO-26: Module 1 rollout, Course Location States (§7) ---------------------------------
  /** Shown when a Story Mission ahead of `current` is tapped — a short diegetic explanation,
   *  never a browser-style error, redirecting attention back to the current dig site (§3.1/§7:
   *  "Story Missions MUST NOT be freely skipped... must not look broken"). Distinct from the
   *  entitlement `lockedMessage` above — this is a sequencing rule, not a purchase gate. */
  courseHomeSequentialLockedMessage: string;
  /** Shown when a not-yet-unlocked Bank Dig is tapped (§5/§7) — same diegetic-explanation
   *  contract as `courseHomeSequentialLockedMessage`, for the Bank's own staged unlock instead
   *  of the Story spine's strict sequence. */
  bankLockedMessage: string;
}

/**
 * WO-11 decision 2 (the Founder's numbered ticket decision — not a section of any AD-02 document
 * present in this repository, see docs/WO-11-implementation-notes-content-classification.md):
 * the three accepted root types a commissioned topic's ねっこ resolves into — しくみ / めあて /
 * わかれ. No quotas across them — a topic is whichever one fits, not filled to a ratio. Authored
 * on every one of the 20 real Story/Bank topics today (see each topic's own s2.json).
 *
 * Kept as plain `string` here (not a literal union), matching `Domain` above and for the same
 * reason: gate:no-hardcoded-copy reserves child-facing/content-vocabulary Japanese string
 * literals for module JSON, never engine source. The closed three-value set is declared and
 * enforced instead in scripts/lib/rootType.ts (outside that gate's scan root) and checked by
 * scripts/lib/moduleClassification.ts's checkMissions() — see tests/rootType.test.ts for the
 * adversarial proof that a fourth value is rejected. Not read or branched on anywhere in the
 * engine today: it briefly was, as one input to `src/shell/progression.ts`'s Bank-unlock
 * schedule (WO-26), but the Blueprint Alignment Cleanup replaced that per-move/rootType-derived
 * staggered schedule with a single flat gate (all 12 Bank Digs unlock together at Story 1-4) —
 * see that file's own `bankState` doc comment.
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
  /** WO-11 decision 2 — see RootType. Authored on every real Story/Bank topic today; optional
   *  here only because synthetic/archived fixtures don't carry it. */
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
