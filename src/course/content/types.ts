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
 * inline below and summarized in the WO-C1/WO-C2 completion reports.
 */

/** WO-C5 §2 adds a 7th tool, `G` (もう 一問／なんで？ゲーム, the beginner course's Lesson 7) — a
 *  new icon in the same AD-18 visual style (`src/course/assets/icons/README.md`), additive to the
 *  six c01-c06 icons. Widening this union is safe for existing content: c01-c06 never use `G`. */
export type CourseToolId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type CoursePracticeShape = 'single' | 'chain2' | 'chain3' | 'chain45' | 'review';

/** Two independent human-review stamps, checked by the CI content gate
 *  (scripts/gate-course-review-approved.ts). `model` is left as a loose string (not narrowed to a
 *  literal) since its exact value space isn't specified by WO-C1 and nothing here depends on it —
 *  only `philosophy`/`japanese` gate production visibility. `note` is authoring/audit-trail text,
 *  never rendered to a child or parent. */
export interface CourseReviewStamp {
  model: string;
  philosophy: 'approved' | null;
  japanese: 'approved' | null;
  note?: string;
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
  /** WO-C2 §3.1/§5: 'talk' is the story dialogue, 'teach' is the closing recap Hate-na gives —
   *  the Listen screen shows a 「まとめ」 divider before the first 'teach' line and reveals the
   *  lesson's tool card once playback reaches it. Optional (the WO-C1 demo lesson predates this
   *  field) — a line with no `section` is treated as 'talk'. */
  section?: 'talk' | 'teach';
  /** Coordinator correction (post-WO-C2-report): the real per-line timestamp (seconds into this
   *  block's `audio`), filled in once the audio is recorded. Optional and absent on every lesson
   *  today — ListenScreen.tsx falls back to an even proportional estimate across the transcript
   *  when it's missing, but uses this exact value (for the recap marker, the current-line
   *  highlight, and tap-to-jump) whenever it's present. */
  start?: number;
}

export interface CourseListenToolCard {
  when: string;
  how: string;
}

/**
 * WO-C2 §5 BREAKING CHANGE from WO-C1: `CourseLesson.listen` is now an ARRAY of these blocks, one
 * per tool taught in the lesson (c01 has two: tool A's audio/transcript, then tool B's), not a
 * single object — mirroring `CourseMakeBlock`'s own existing array shape. Each block is its own
 * きく step (WO-C2 §1's 8-step flow: きくA → れんしゅうA → きくB → れんしゅうB → …).
 */
export interface CourseListenBlock {
  tool: CourseToolId;
  audio: string;
  methodCards: CourseToolId[];
  transcript: CourseTranscriptLine[];
  /** WO-C2 §3.1/§5: the exercise ids this block's practice step covers, in play order — drives
   *  which `CourseLesson.exercises` entries the れんしゅう step following this きく step opens. */
  thenExercises: string[];
  /** Shown once playback reaches this block's recap (its first `section: 'teach'` transcript
   *  line) and stays visible from then on, even if the child scrubs back earlier. */
  toolCard: CourseListenToolCard;
}

export interface CourseSpeechLine {
  speaker: CourseSpeaker;
  text: string;
  /** WO-C2b: a production-only sound/performance note for this line (e.g. park ambience for
   *  about a second, then the line), never spoken or rendered — it used to be folded into `text`
   *  itself as a stage direction (WO-C2's original e01-c reply had 公園で prefixed to the line,
   *  in its own parentheses); the Coordinator's audio sheet moved it out into its own field so
   *  the on-screen/spoken text stays exactly what's said. Read only by the audio-generation
   *  pipeline, never by any screen. */
  audioCue?: string;
}

/** WO-C5 §2: the beginner course adds `sameTool` (the child used today's tool on a different,
 *  still-valid angle — ExerciseScreen treats it as a SUCCESS alongside `best`, not a miss) to the
 *  three roles c01-c06 already use. Additive — c01-c06 content never uses `sameTool`. */
export type CourseOptionRole = 'best' | 'otherTool' | 'nearMiss' | 'sameTool';
/** WO-C5 §2: `stop` (「ふーん、そうなんだ。」, b07's なんで？ゲーム) is spoken by ポン太 like a
 *  question card — ExerciseScreen renders it identically to `question` (voiced reply, standard
 *  card), the `kind` value only distinguishes it for authoring clarity. Additive. */
export type CourseOptionKind = 'question' | 'okButton' | 'stop';

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
  /** WO-C2 §5: the option ids in the order the Practice screen should display their cards —
   *  independent of `options`' own declaration order (which stays `best`-first for readability of
   *  the JSON, not for display). Optional — falls back to `options`' own declared order (the
   *  WO-C1 demo lesson predates this field, and a missing `displayOrder` is simply "declaration
   *  order," never an error). */
  displayOrder?: string[];
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
  /** WO-C2 §3.3/§5: when the parent-mode switch is OFF, 「ヒント」 shows `h1`; pressing again
   *  highlights `h2Highlight` inside the dialogue. Optional — a block without it simply has no
   *  independent hint affordance (its starter cards are the only support offered). */
  hint?: { h1: string; h2Highlight: string };
  /** WO-C2 §3.3/§5: the small note shown under 「しつもんのれいを見る」's revealed `parentPeek`
   *  ("this is an example, yours doesn't have to match"). */
  peekNote?: string;
  /** WO-C2 §3.3/§5: a small always-visible note to the parent, distinct from `parentPrompts`. */
  parentNote?: string;
}

/**
 * WO-C2 §5 BREAKING CHANGE from WO-C1 (which had `{prompt}` only): the real c01.lesson.json's
 * teach-back step shows one tool card per tool taught, each revealing its own `help` text on
 * demand (WO-C1 §3 screen 6 becomes WO-C2 §3.4).
 */
export interface CourseTeachBackCard {
  tool: CourseToolId;
  frame: string;
  help: string;
}

export interface CourseTeachBack {
  prompt: string;
  /** Optional — the WO-C1 demo lesson predates this field (a single-tool `{prompt}`-only
   *  teach-back is still a valid, simpler screen). */
  cards?: CourseTeachBackCard[];
  parentNote?: string;
}

export interface CourseFamily {
  whoKnows: string;
  aiExample: string;
  applyTool: string;
  notes: string[];
  /** WO-C2 §5: shown above the `choices` picker — optional, the WO-C1 demo lesson predates it. */
  intro?: string;
  /** WO-C2 §5/§3.6: the questions the child picks from before the family-inquiry guidance is
   *  shown; picked on-screen only, never saved to progress. */
  choices?: string[];
  /** WO-C2 §5: DEVIATION from WO-C1's plain boolean `stars`-only model — this is the star
   *  button's own LABEL text (e.g. 「おうちでしらべた」), not a boolean flag; whether the star is
   *  lit is still `CourseLessonProgress.stars > 0`, unchanged. Optional — falls back to
   *  `courseUi.familyStarLabel` when absent (the WO-C1 demo lesson predates this field). */
  star?: string;
  parentNote?: string;
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

/** WO-C2 §5: one entry in the content-authoring fact-check queue — never rendered to a child or
 *  parent (see `CourseLesson.factChecks`' own doc comment). Richer than WO-C1's original
 *  `{where, claim, status}`-only shape: `sources`/`note` are new. */
export interface CourseFactCheck {
  where: string;
  claim: string;
  status: string;
  sources?: string[];
  note?: string;
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
 *
 * `version`/`listenReview` are WO-C2 §5 additions: `version` is a free-form authoring changelog
 * string (never rendered); `listenReview` is a lesson-wide review stamp for the two audio scripts,
 * shaped exactly like `CourseReviewStamp` (same `isFullyApproved` check applies to it — see
 * scripts/lib/courseContentGate.ts).
 */
export interface CourseLesson {
  id: string;
  title: string;
  tools: CourseToolId[];
  practice: CoursePracticeShape;
  review: CourseReviewStamp;
  listen: CourseListenBlock[];
  exercises: CourseExercise[];
  make: CourseMakeBlock[];
  teachBack: CourseTeachBack;
  family: CourseFamily;
  parentCard: CourseParentCard;
  factChecks?: CourseFactCheck[];
  bDefinitionNote?: string;
  version?: string;
  listenReview?: CourseReviewStamp;
}

/** WO-C5: `'ending'` is new — the beginner course's さいごのページ (opens once all 7 lessons are
 *  100%). Additive to the two kinds `stage2`'s own `course.json` uses; that manifest never emits
 *  `'ending'`, so this is a no-op there. */
export type CoursePartKind = 'playground' | 'lesson' | 'ending';

export interface CoursePart {
  id: string;
  kind: CoursePartKind;
  /** Only meaningful for `kind: 'playground'` — the Playground's own story-mission count, used
   *  to compute its 12.5%-per-mission flower fill (WO-C1 §4 / Coordinator: "The Playground (m1)
   *  counts as flower 1... Don't add a progress bar inside the Playground" — this count is read
   *  from the course side only, nothing is written back into Playground state). */
  missions?: number;
}

/* =================================================================================================
 * WO-C5 — 入門コース (beginner course): a SECOND, separate course (`courseId: 'beginner'`) built on
 * this same content-type vocabulary, alongside `stage2` (c01-c12) rather than merged into it. Its
 * own manifest lives at `content/lessons/beginner.course.json` / loaded by
 * `content/beginnerManifest.ts` — `course.json`/`courseManifest.ts` (stage2's own files) are
 * untouched. Reuses `CourseListenBlock`/`CourseExercise`/`CourseExerciseStep`/`CourseSpeechLine`
 * unchanged (the widened `CourseToolId`/`CourseOptionRole`/`CourseOptionKind` above cover every
 * beginner-only value) — only the LESSON-level shape differs (single `listen` object, no
 * make/teachBack/family, two new sections `audit`/`home`), so only that shape gets a new type
 * rather than widening `CourseLesson` itself with a bunch of now-conditionally-required fields.
 * ================================================================================================= */

/** WO-C5 §3 screen 3 (チェック): one of 4 per lesson. Voiced `q0`/`answer`/`prompt`, then 3 cards —
 *  tapping one voices+shows its own feedback (no reply line, unlike a practice-item option).
 *  `ok` advances to the next item; anything else prompts a retry, narrowing to the remaining
 *  card(s) after a repeated miss (3 cards total, so a second miss always leaves exactly one). */
export type CourseAuditCardRole = 'ok' | 'other' | 'none' | 'near';

/** The real content authors each card as a positional tuple, `[role, text, feedback]` — not an
 *  object (WO-C5 §2's own "cards[[role,text,feedback]]" is literal, not shorthand). */
export type CourseAuditCard = [role: CourseAuditCardRole, text: string, feedback: string];

/** Also positional (`[speaker, text]`), same reasoning as `CourseAuditCard`. */
export type CourseAuditLine = [speaker: string, text: string];

export interface CourseAuditItem {
  id: string;
  scene: string;
  q0: CourseAuditLine;
  answer: CourseAuditLine;
  prompt: string;
  cards: CourseAuditCard[];
}

/** WO-C5 §3 screen 4 (おうちで): voiced `title`+`steps`, `wordHints` as small reference cards, and
 *  a parent-only area (`parentNote` + the big `button` a parent presses, storing a ★ — same
 *  `stars` counter/semantics as the existing course's family-star, never required for 100%). */
export interface CourseHomeTask {
  title: string;
  steps: string[];
  wordHints: string[];
  button: string;
  parentNote: string;
}

/**
 * A beginner-course lesson (b01-b07). `listen` is a SINGLE block (not an array — WO-C5 §2's own
 * first "shape difference from c01"), reusing `CourseListenBlock`'s exact field set. No
 * make/teachBack/family/parentCard — きく→れんしゅう→チェック→おうちで is the whole flow.
 */
export interface CourseBeginnerLesson {
  id: string;
  course: 'beginner';
  title: string;
  tool: CourseToolId;
  listen: CourseListenBlock;
  exercises: CourseExercise[];
  audit: CourseAuditItem[];
  home: CourseHomeTask;
  review: CourseReviewStamp;
  /** Authoring-only fields real content carries (`n`, `object`, `factChecks`, `version`) — never
   *  rendered by any screen, kept optional/untyped-through rather than stripped from the content
   *  (WO-C5 §1: "Ignore unknown fields... not rendered"). */
  factChecks?: CourseFactCheck[];
}

/** The beginner course's さいごのページ (b-ending.json) — its own shape, not a `CourseListenBlock`
 *  (no `tool`/`methodCards`/`thenExercises`/`toolCard`, and its transcript lines carry no
 *  `section`/`part`). `screenLine`/`screenSub` are the full-screen text shown once the transcript
 *  finishes playing (WO-C5 §3 screen 5) — same two strings as `beginner.course.json`'s own
 *  `finalScreen.{line,sub}`, kept on the lesson file too so the ending screen needs only this one
 *  object. */
export interface CourseEndingLesson {
  id: string;
  course: 'beginner';
  title: string;
  scene: string;
  transcript: CourseTranscriptLine[];
  screenLine: string;
  screenSub: string;
  review: CourseReviewStamp;
  audio: string;
}

export interface CourseBeginnerPart {
  id: string;
  kind: 'lesson' | 'ending';
  tool?: CourseToolId;
  icon?: string;
  opensWhen?: string;
}

export interface CourseBeginnerManifest {
  courseId: 'beginner';
  title: string;
  price: { yen: number; kind: string; sku: string };
  parts: CourseBeginnerPart[];
  finalScreen: { line: string; sub: string };
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
  stepLockedNote: string;
  parentLinkLabel: string;
  demoLinkLabel: string;
  flowerStageLabel: { seed: string; sprout: string; bud: string; flower: string };
  lessonStepListenA: string;
  lessonStepListenB: string;
  lessonStepExerciseA: string;
  lessonStepExerciseB: string;
  lessonStepMake: string;
  lessonStepTeachBack: string;
  familyLinkLabel: string;
  exerciseProgressLabel: string;
  exerciseHintLabel: string;
  exerciseRetryLabel: string;
  exerciseNextLabel: string;
  backToLessonLabel: string;
  listenPlayLabel: string;
  listenPauseLabel: string;
  listenSummaryDivider: string;
  listenToExerciseLabel: string;
  makeTriedLabel: string;
  makeNextLabel: string;
  makeStartersTitle: string;
  makeParentToggleLabel: string;
  makeNextHintLabel: string;
  makeSayItPrompt: string;
  makeSelfCheckTitle: string;
  makePeekRevealLabel: string;
  makePeekTitle: string;
  teachBackDoneLabel: string;
  teachBackDoneNote: string;
  teachBackHelpLabel: string;
  teachBackContinueLabel: string;
  familyWhoKnowsLabel: string;
  familyAiExampleLabel: string;
  familyApplyToolLabel: string;
  familyStarLabel: string;
  familyChoicesLabel: string;
  parentHeading: string;
  parentNoteLabel: string;
  parentEarlyUnlockLabel: string;
  parentMonthLabel: string;
  parentDayLabel: string;
  toolLabels: Record<CourseToolId, { object: string; label: string }>;
  /** WO-C5 §9 — new chrome for the beginner course's own screens; c01-c06 never read these. */
  beginnerCourseTitle: string;
  beginnerGardenTitle: string;
  lessonStepListenSingle: string;
  lessonStepExerciseSingle: string;
  lessonStepAudit: string;
  lessonStepHome: string;
  auditOkLabel: string;
  beginnerToolBadgeLabel: string;
  /** Template — `{n}`/`{total}` are replaced by the caller (e.g. "なんで？ 1/3"). */
  chainStepLabel: string;
  beginnerLockedCta: string;
  endingPartTitle: string;
  homeButtonFallback: string;
  certificateContinueLabel: string;
  certificateHeading: string;
  certificateBlankLabel: string;
  printCentreLabel: string;
  beginnerHanamaruLabel: string;
  practice: {
    nextPrompt: string;
    /** The fixed guide character's name (WO-C2 §3.2: "reply voiced by reply speaker, then
     *  feedback voiced by ハテナ") — feedback strings in c01.lesson.json carry no speaker field of
     *  their own since it's always this one fixed course-wide character, same as `toolLabels`
     *  being fixed chrome rather than per-lesson content. */
    feedbackSpeaker: string;
    hintLabel: string;
    triedLabel: string;
    retryLabel: string;
    retryPrompt: string;
    onlyOneLeftPrompt: string;
    badgeToolUsed: string;
    nextLabel: string;
    seeOtherCardsLabel: string;
    closeLabel: string;
    doneLabel: string;
  };
  /** Post-launch-check (Founder, domo-ai.com): the small site header (src/ad12/SiteHeader.tsx)
   *  shown on the garden once a real family account is configured — brand/home link, the
   *  Playground/beginner-course switcher, account, and logout. */
  siteHeaderBrandLabel: string;
  siteHeaderPlaygroundLabel: string;
  siteHeaderCourseLabel: string;
  siteHeaderAccountLabel: string;
  siteHeaderLogoutLabel: string;
  /** WO-C6 A2: a quiet retry on the one line/card whose clip failed to load — never blocks the
   *  lesson. Distinct from `practice.retryLabel` (which re-picks a wrong answer, not a clip). */
  audioRetryLabel: string;
  /** WO-C6 Push B — new screen chrome the approved course-screens.html design introduces (none of
   *  these change any existing lesson content; see courseUi.json's own doc comment for the report
   *  list). */
  gardenSubtitle: string;
  gardenCompleteNote: string;
  nextStepPrefix: string;
  profileAddLabel: string;
  profileAccountCaption: string;
  lessonStepListenSubtitle: string;
  lessonStepExerciseSubtitle: string;
  lessonStepAuditSubtitle: string;
  lessonStepHomeSubtitle: string;
  listenTranscriptHeading: string;
  listenRecapMarkerLabel: string;
  listenTranscriptTabLabel: string;
  homeWordHintsHeading: string;
  homeSkipNote: string;
}
