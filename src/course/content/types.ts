/**
 * WO-C1: the formal course's own content schema. Deliberately separate from `src/engine/types.ts`
 * (the Playground's Mission/Phase shapes) — the course's screens (listen/exercise/make/teach-back/
 * family) are a different interaction grammar than the Playground's slot-assembly+dig engine, per
 * WO-C1 §3's own instruction ("write small, data-driven state machines... reuse AD-12 primitives
 * and infrastructure only, not the dig/slot engine").
 *
 * `CourseToolId` names the six locked AD-18 tool icons (src/course/assets/icons/) — see that
 * folder's own README for the object/label each one stands for.
 *
 * These types were written against the REAL Lesson 1 content the Coordinator supplied
 * (c01.lesson.json), not just WO-C1 §2's own illustrative schema sketch — several fields genuinely
 * don't match that sketch, adapted here rather than changed in the content (per instruction: "If a
 * field doesn't fit, tell me rather than changing the content"). Every deviation is called out
 * inline below and summarized in the WO-C1 completion report.
 */

export type CourseToolId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type CoursePracticeShape = 'single' | 'chain2' | 'chain3' | 'chain45' | 'review';

/** Two independent human-review stamps, checked by the CI content gate
 *  (scripts/gate-course-review-approved.ts). `model` is left as a loose string (not narrowed to a
 *  literal) since its exact value space isn't specified by WO-C1 and nothing here depends on it —
 *  only `philosophy`/`japanese` gate production visibility. */
export interface CourseReviewStamp {
  model: string;
  philosophy: 'approved' | null;
  japanese: 'approved' | null;
}

/** Free-form — the real content's cast is bigger than the two recurring leads (おかあさん,
 *  先生, and other one-off family voices all appear as `q0`/`answer`/`reply` speakers too), so
 *  this is never narrowed to a closed union. */
export type CourseSpeaker = string;

export interface CourseTranscriptLine {
  speaker: CourseSpeaker;
  text: string;
  /** DEVIATION from WO-C1 §2's sketch (which has no such field): the real c01.lesson.json groups
   *  transcript lines into named mini-sections via a `part` label on every line (each section's
   *  own short Japanese heading, e.g. lesson c01's own A-1/A-2/etc. — see that file directly for
   *  the exact text). Kept as an optional field and used for section breaks in the Listen
   *  screen's transcript view when present, rather than dropped. */
  part?: string;
}

export interface CourseListen {
  audio: string;
  transcript: CourseTranscriptLine[];
  methodCards: CourseToolId[];
}

export interface CourseSpeechLine {
  speaker: CourseSpeaker;
  text: string;
}

export type CourseOptionRole = 'best' | 'otherTool' | 'nearMiss';
export type CourseOptionKind = 'question' | 'okButton';

export interface CourseExerciseOption {
  id: string;
  role: CourseOptionRole;
  kind: CourseOptionKind;
  /** Nullable in the real content (e.g. a plain curiosity question tied to no specific tool) —
   *  WO-C1 §2's sketch types this as a bare tool id; real c01.lesson.json has `"tool": null` on
   *  several options, so this is typed nullable rather than forced non-null. */
  tool: CourseToolId | null;
  text: string;
  reply: CourseSpeechLine;
  feedback: string;
}

export interface CourseExerciseStep {
  answer: CourseSpeechLine;
  hint: { h1: string; h2Highlight: string };
  options: CourseExerciseOption[];
}

export interface CourseExercise {
  id: string;
  tool: CourseToolId;
  scene: {
    /** Optional — the real content's scenes are text-only so far (no `image` supplied yet). */
    image?: string;
    text: string;
  };
  q0: CourseSpeechLine;
  steps: CourseExerciseStep[];
  review: CourseReviewStamp;
}

export interface CourseParentPrompt {
  step: 'notice' | 'point' | 'card' | 'check';
  text: string;
}

/**
 * DEVIATION from WO-C1 §2's sketch: the sketch shows a single `make: {...}` object per lesson.
 * The real c01.lesson.json has `make` as an ARRAY of one block per tool taught that lesson (two
 * blocks here, one for tool A and one for tool B) — so `CourseLesson.make` is typed as
 * `CourseMakeBlock[]`, not a single block. `turnTaking`/`printCards` from the sketch are also
 * absent from the real content and kept optional here rather than required.
 */
export interface CourseMakeBlock {
  tool: CourseToolId;
  dialogue: CourseSpeechLine[];
  methodCard: CourseToolId;
  starterCards: string[];
  parentPrompts: CourseParentPrompt[];
  selfCheck: string[];
  /** Unlocks only after the make step's 「いって みた！」 button (WO-C1 §3 screen 5). */
  parentPeek: string[];
  turnTaking?: { printCards: string[] };
}

export interface CourseTeachBack {
  prompt: string;
}

export interface CourseFamily {
  whoKnows: string;
  aiExample: string;
  applyTool: string;
  notes: string[];
}

/**
 * DEVIATION from WO-C1 §2's sketch: the sketch has `parentCard.sourceUrl: string` (one URL). The
 * real content instead has `parentCard.sources: CourseParentCardSource[]` — a list, each with its
 * own review `status` (e.g. `"to verify"`) — since a parent card can cite more than one study and
 * each needs its own verification state tracked independently. Kept as the richer shape rather
 * than collapsed to a single URL.
 */
export interface CourseParentCardSource {
  label: string;
  url: string;
  status: string;
}

export interface CourseParentCard {
  tool: string;
  method: string;
  sources: CourseParentCardSource[];
  dinnerQuestion: string;
}

/**
 * A lesson's `n` (its 1-12 position) is deliberately NOT a field on the lesson JSON itself — WO-
 * C1 §2's sketch has one, but the real c01.lesson.json omits it. Duplicating an ordinal on every
 * lesson file risks drifting from the manifest's own `parts` order (the single source of truth
 * for lesson sequence — see course.json); `n` is derived from a lesson's index among `kind:
 * 'lesson'` parts instead (src/course/content/courseManifest.ts's `lessonNumberFor`).
 *
 * `factChecks` and `bDefinitionNote` are real fields on c01.lesson.json that no course screen
 * renders to children — they're content-authoring/fact-check-pipeline bookkeeping (an open
 * Gate-1 claims queue, and an internal note disambiguating tool B's definition for this lesson).
 * Kept as optional, deliberately unused-by-the-renderer fields rather than stripped, so the
 * content file doesn't need to be edited to satisfy this schema.
 */
export interface CourseLesson {
  id: string;
  title: string;
  tools: CourseToolId[];
  practice: CoursePracticeShape;
  review: CourseReviewStamp;
  listen: CourseListen;
  exercises: CourseExercise[];
  make: CourseMakeBlock[];
  teachBack: CourseTeachBack;
  family: CourseFamily;
  parentCard: CourseParentCard;
  factChecks?: unknown;
  bDefinitionNote?: string;
}

export type CoursePartKind = 'playground' | 'lesson';

export interface CoursePart {
  id: string;
  kind: CoursePartKind;
  /** Only meaningful for `kind: 'playground'` — the Playground's own story-mission count, used
   *  to compute its 12.5%-per-mission flower fill (WO-C1 §4 / Coordinator: "The Playground (m1)
   *  counts as flower 1... Don't add a progress bar inside the Playground" — this count is read
   *  from the course side only, nothing is written back into Playground state). */
  missions?: number;
}

/**
 * The manifest's own top-level `courseStage` — DEVIATION from WO-C1 §2's sketch, which names this
 * field `stage`. Renamed to avoid colliding with the pre-existing, semantically different
 * `Profile.stage`/`Mission.stage` (grade-level, 1|2|3) already used throughout src/engine and
 * src/shell — `courseStage` here means "which formal-course product tier this file is," an
 * unrelated concept that happens to reuse the word "stage" in WO-C1's own title.
 */
export interface CourseManifest {
  courseStage: number;
  parts: CoursePart[];
}

/**
 * Fixed, course-wide UI chrome (never lesson-specific) — matches `courseUi.json`, mirroring
 * `ModuleUiStrings`/`module.json`'s own `ui` block (src/engine/types.ts) exactly: spec v0.5 §7's
 * "child-facing strings only in module JSON" rule applies here too (gate:no-hardcoded-copy scans
 * all of `src/course`, same as it scans `src/engine`/`src/shell` — course screens take these
 * strings from here instead of a literal, so a wording change never means editing a component).
 */
export interface CourseUiStrings {
  loading: string;
  loginRequired: string;
  loginCta: string;
  comingSoon: string;
  profilePickTitle: string;
  profileLabel: string;
  reviewBadge: string;
  sixtyPercentNotice: string;
  back: string;
  gardenTitle: string;
  playgroundFlowerTitle: string;
  nextStoryFlowerTitle: string;
  lessonNotYetNote: string;
  lessonLockedNote: string;
  parentLinkLabel: string;
  demoLinkLabel: string;
  flowerStageLabel: { seed: string; sprout: string; bud: string; flower: string };
  lessonStepListen: string;
  lessonStepExercise: string;
  lessonStepMake: string;
  lessonStepTeachBack: string;
  familyLinkLabel: string;
  exerciseProgressLabel: string;
  exerciseHintLabel: string;
  exerciseRetryLabel: string;
  exerciseNextLabel: string;
  backToLessonLabel: string;
  listenDoneLabel: string;
  makeTriedLabel: string;
  makeNextLabel: string;
  makeStartersTitle: string;
  makeParentToggleLabel: string;
  makeSelfCheckTitle: string;
  makePeekTitle: string;
  teachBackDoneLabel: string;
  familyWhoKnowsLabel: string;
  familyAiExampleLabel: string;
  familyApplyToolLabel: string;
  familyStarLabel: string;
  parentHeading: string;
  parentEarlyUnlockLabel: string;
  parentMonthLabel: string;
  parentDayLabel: string;
  toolLabels: Record<CourseToolId, { object: string; label: string }>;
}
