/**
 * WO-C1 §5: the formal course's own content gate — pure logic, unit-tested separately
 * (tests/courseContentGate.test.ts), no filesystem access. CLI plumbing lives in
 * scripts/gate-course-review-approved.ts, mirroring the existing split between
 * scripts/gate-claims-approved.ts and scripts/lib/moduleClassification.ts.
 *
 * Two independent checks:
 *
 *   1. `approvalIssues` — WO-C1 §5's literal rule: "A CI check fails the build if any exercise,
 *      or any lesson-level record, in a PRODUCTION BUILD lacks review.philosophy=='approved' and
 *      review.japanese=='approved'." Only enforced when `opts.strict` is true — mirroring
 *      gate-claims-approved.ts's own `RELEASE=1` -> `STRICT` convention exactly, the same signal
 *      that already distinguishes a real release cut from routine/preview CI. This is the
 *      mechanism that keeps c01 (its own review still `null`/`null`) out of a real production
 *      build without needing to change or remove it from the repo — routine CI never sets
 *      RELEASE=1, so this check simply doesn't run there, and c01 stays reachable to allowlisted
 *      preview families behind its own 「レビュー中」 badge.
 *
 *   2. `contentLintIssues`/`contentLintWarnings` — the same kanji-grade/ruby/sentence-length/
 *      banned-word/PII-word checks pipeline/lib/lintText.ts already applies to Playground release
 *      content, run over every CHILD-facing string in the lesson (title, transcript, exercise/
 *      make/teach-back text). Independent of `strict`/RELEASE=1: it runs on every course lesson,
 *      every CI run, but only ever FAILS the build for a lesson that is ALREADY marked
 *      `review.philosophy === 'approved' && review.japanese === 'approved'` — i.e. once human
 *      reviewers have signed off, the mechanical checks become a belt-and-suspenders net against
 *      a sign-off that missed an unannotated above-grade kanji. For a still-pending lesson (like
 *      c01 today) the exact same findings are reported as non-blocking warnings, so content
 *      authors see what 酒井先生's review will need to fix without it blocking anyone's build.
 *      Parent-facing fields (make.parentPrompts, make.parentPeek, family.*, parentCard.*) are
 *      exempt from the kanji-grade/ruby check (same reasoning gate:no-hardcoded-copy already
 *      applies to src/parent — a parent reads these, not the child) but still checked for
 *      banned/PII words, since those are safety rules, not audience-level ones.
 */
import { STAGE_LIMITS, type GradeMap } from '../../pipeline/lib/kanji.js';
import { stripRuby } from '../../pipeline/lib/ruby.js';
import { checkKanjiFloor } from '../../pipeline/lib/kanjiFloor.js';
import { lintText, type LintIssue } from '../../pipeline/lib/lintText.js';
import { courseUi } from '../../src/course/content/courseManifest.js';
import type { CourseLesson, CourseReviewStamp } from '../../src/course/content/types.js';

const COURSE_STAGE = 2; // WO-C1's own "Stage 2" — see CourseManifest.courseStage's own doc comment

/**
 * Architect correction (post-report): `pipeline/lib/lintText.ts`'s own `length` rule measures
 * the WHOLE string passed to it — correct for the Playground, whose own authored lines are
 * already one sentence each, but wrong for the course's exercise feedback, which is routinely
 * 2-3 sentences in one JSON string. Rather than changing `lintText` itself (shared with the
 * Playground's own release gate — WO-C1's "only additive changes to shared code" forbids
 * widening its behavior for every caller), this file runs its OWN per-sentence length check for
 * child-facing course text only, splitting on 。！？ (kept attached to the sentence it ends),
 * and discards `lintText`'s own whole-string `length` finding in favour of it. Every other
 * `lintText` rule (kanji-grade, ruby, kanji-floor, banned/PII-word) is unaffected — those are
 * correct at the whole-string level regardless of sentence count.
 */
function splitIntoSentences(text: string): string[] {
  return text.split(/(?<=[。！？])/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function checkSentenceLengths(text: string, stage: number): LintIssue[] {
  const limit = STAGE_LIMITS[stage]?.maxSentence;
  if (limit === undefined) return [];
  const issues: LintIssue[] = [];
  for (const sentence of splitIntoSentences(stripRuby(text))) {
    if (sentence.length > limit) {
      issues.push({
        rule: 'length',
        message: `${sentence.length} chars > stage ${stage} limit ${limit}: 「${sentence}」`,
        text,
      });
    }
  }
  return issues;
}

/**
 * Architect correction (post-report): the six AD-18 tool names are locked exact strings — they
 * stay written exactly as they appear on the icons (`courseUi.json`'s own `toolLabels[x].label`,
 * the single source of truth reused here rather than a second copy), never rewritten to match
 * AD-05's own kanji-floor style even where they appear embedded inside otherwise-compliant prose
 * (e.g. teachBack.prompt quotes 「まえの りゆうを 見る」 verbatim). Kanji-floor scanning runs
 * against the text with every exact occurrence of these six strings removed first — every OTHER
 * check (kanji-grade, ruby, sentence-length, banned/PII-word) still sees the full, unredacted
 * text, since only kanji-floor's "should be kanji" judgment is what these locked strings are
 * exempt from.
 */
const TOOL_NAME_EXEMPT: readonly string[] = Object.values(courseUi.toolLabels).map((t) => t.label);

export function redactToolNamesForKanjiFloor(text: string): string {
  let out = text;
  for (const name of TOOL_NAME_EXEMPT) out = out.split(name).join('');
  return out;
}

export function isFullyApproved(review: CourseReviewStamp | undefined | null): boolean {
  return review?.philosophy === 'approved' && review?.japanese === 'approved';
}

export interface CourseGateOptions {
  /** Mirrors gate-claims-approved.ts's own `RELEASE=1` -> `STRICT` signal — true only for a real
   *  production-release CI cut, never for routine/preview CI. */
  strict: boolean;
}

export interface CourseGateResult {
  /** Only ever non-empty when `strict` — see file header §1. */
  approvalIssues: string[];
  /** Non-empty only once `isFullyApproved(lesson.review)` — see file header §2. */
  contentLintIssues: string[];
  /** Same lint, but for a NOT-yet-approved lesson — informational, never fails CI, so content
   *  authors/reviewers can see what still needs fixing without it blocking anyone else's build. */
  contentLintWarnings: string[];
}

/**
 * WO-C2 §5: `lesson.listen` is now an array of one block per tool (WO-C1 had a single object) —
 * every block's transcript/toolCard text is child-facing, same as before. `hint.h2Highlight` was
 * always child-facing too (it's quoted verbatim inside the answer on-screen) but was never scanned
 * pre-WO-C2 — added here alongside the other new child-facing surfaces (teachBack.cards,
 * family.intro/choices). `factChecks`, `bDefinitionNote`, `version`, and `listenReview`'s own
 * `note` are deliberately never collected — none of them are ever rendered to a child or parent
 * (content-authoring/fact-check bookkeeping only — see CourseLesson's own doc comment).
 */
function childFacingTexts(lesson: CourseLesson): string[] {
  const texts: string[] = [lesson.title];
  for (const block of lesson.listen) {
    for (const line of block.transcript) texts.push(line.text);
    texts.push(block.toolCard.when, block.toolCard.how);
  }
  for (const ex of lesson.exercises) {
    texts.push(ex.scene.text, ex.q0.text);
    for (const step of ex.steps) {
      texts.push(step.answer.text, step.hint.h1, step.hint.h2Highlight);
      for (const opt of step.options) texts.push(opt.text, opt.reply.text, opt.feedback);
    }
  }
  for (const block of lesson.make) {
    for (const line of block.dialogue) texts.push(line.text);
    texts.push(...block.starterCards, ...block.selfCheck);
    if (block.hint) texts.push(block.hint.h1, block.hint.h2Highlight);
  }
  texts.push(lesson.teachBack.prompt);
  for (const card of lesson.teachBack.cards ?? []) texts.push(card.frame, card.help);
  if (lesson.family.intro) texts.push(lesson.family.intro);
  texts.push(...(lesson.family.choices ?? []));
  return texts;
}

/**
 * WO-C2 §5: `make[].peekNote`/`.parentNote`, `teachBack.parentNote`, and `family.parentNote` are
 * all new parent-facing surfaces (same audience as `parentPrompts`/`parentPeek`/`family.*` already
 * were) — banned/PII-word checked, never kanji-grade/ruby/length checked, same as every other
 * parent-facing field (see file header §2 and `lintParentFacing`). `family.star` is a short button
 * LABEL, not prose — deliberately not scanned (same reasoning `courseUi.json`'s own chrome strings
 * are never lint targets: it's fixed UI copy, reused across every lesson, not lesson content).
 */
function parentFacingTexts(lesson: CourseLesson): string[] {
  const texts: string[] = [];
  for (const block of lesson.make) {
    for (const p of block.parentPrompts) texts.push(p.text);
    texts.push(...block.parentPeek);
    if (block.peekNote) texts.push(block.peekNote);
    if (block.parentNote) texts.push(block.parentNote);
  }
  if (lesson.teachBack.parentNote) texts.push(lesson.teachBack.parentNote);
  texts.push(lesson.family.whoKnows, lesson.family.aiExample, lesson.family.applyTool, ...lesson.family.notes);
  if (lesson.family.parentNote) texts.push(lesson.family.parentNote);
  texts.push(lesson.parentCard.tool, lesson.parentCard.method, lesson.parentCard.dinnerQuestion);
  return texts;
}

/**
 * Architect correction (post-report): `pii-word`/`banned-word` legitimately false-positive on a
 * sentence whose whole point IS telling a family not to share personal data, or not to treat a
 * practice item as scored — e.g. family.notes's own 「AI には、名前や 学校名、じゅうしょを 入れ
 * ない」 mentions 学校名/じゅうしょ to warn against them, not to request them; make[].parentNote's
 * own 「正解を言わせる場面ではありません。」 says this ISN'T a right-answer scenario. Loosening the
 * lint itself was rejected — instead, an EXACT-match allowlist of full SENTENCES already vetted as
 * safety instructions, never a substring/prefix match, so a genuinely PII-requesting or scored-
 * answer sentence that happens to share a few characters can never slip through. Checked at
 * SENTENCE granularity (`splitIntoSentences`, below), not whole-field: a multi-sentence field like
 * `family.parentNote` can freely mix one allowlisted safety sentence with other, independently-
 * checked sentences. Every entry here was explicitly approved by the Coordinator; adding a new one
 * needs the same sign-off — never add to either list unilaterally.
 */
const PII_SAFE_SENTENCES: readonly string[] = [
  'AIには、名前や学校名、じゅうしょを入れない',
  'お子さんの名前・学校名・住所などは入力しないでください。',
];

const BANNED_WORD_SAFE_SENTENCES: readonly string[] = [
  '正解を言わせる場面ではありません。',
];

function dropAllowlistedIssues(issues: LintIssue[], sentence: string): LintIssue[] {
  return issues.filter((i) => {
    if (i.rule === 'pii-word' && PII_SAFE_SENTENCES.includes(sentence)) return false;
    if (i.rule === 'banned-word' && BANNED_WORD_SAFE_SENTENCES.includes(sentence)) return false;
    return true;
  });
}

/** Runs `lintText`, keeping only banned-word/pii-word findings, sentence by sentence — the
 *  granularity the allowlists above are checked at. Used for both child- and parent-facing text;
 *  callers add whichever other rules apply to their own audience on top. */
function bannedAndPiiIssues(text: string, gradeOf: GradeMap): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const sentence of splitIntoSentences(text)) {
    const found = lintText(sentence, COURSE_STAGE, gradeOf).filter((i) => i.rule === 'banned-word' || i.rule === 'pii-word');
    issues.push(...dropAllowlistedIssues(found, sentence));
  }
  return issues;
}

function checkKanjiFloorExempt(text: string): LintIssue[] {
  return checkKanjiFloor(redactToolNamesForKanjiFloor(text)).map((v) => ({
    rule: 'kanji-floor',
    message: `「${v.kana}」should be written 「${v.kanji}」 (AD-05 kanji floor)`,
    text,
  }));
}

function lintChildFacing(text: string, gradeOf: GradeMap): LintIssue[] {
  // kanjiFloor left off here — computed separately (checkKanjiFloorExempt) against the
  // tool-name-redacted text instead, so a locked tool name embedded in otherwise-compliant
  // prose is never flagged.
  const issues = lintText(text, COURSE_STAGE, gradeOf).filter(
    (i) => i.rule !== 'length' && i.rule !== 'banned-word' && i.rule !== 'pii-word',
  );
  return [
    ...issues,
    ...bannedAndPiiIssues(text, gradeOf),
    ...checkKanjiFloorExempt(text),
    ...checkSentenceLengths(text, COURSE_STAGE),
  ];
}

/** Parent-facing text: banned/PII checks only (`lintText`'s kanji-grade/ruby/length rules are
 *  child-audience rules — see file header). */
function lintParentFacing(text: string, gradeOf: GradeMap): LintIssue[] {
  return bannedAndPiiIssues(text, gradeOf);
}

function approvalLabel(review: CourseReviewStamp | undefined | null): string {
  return `philosophy=${review?.philosophy ?? 'null'}, japanese=${review?.japanese ?? 'null'}`;
}

export function checkCourseLesson(lesson: CourseLesson, gradeOf: GradeMap, opts: CourseGateOptions): CourseGateResult {
  const approvalIssues: string[] = [];
  if (opts.strict) {
    if (!isFullyApproved(lesson.review)) {
      approvalIssues.push(`lesson ${lesson.id}: not fully approved (${approvalLabel(lesson.review)})`);
    }
    for (const ex of lesson.exercises) {
      if (!isFullyApproved(ex.review)) {
        approvalIssues.push(`lesson ${lesson.id} exercise ${ex.id}: not fully approved (${approvalLabel(ex.review)})`);
      }
    }
    // WO-C2 §5: `listenReview` is a lesson-wide review stamp for the two audio scripts, shaped
    // exactly like every other CourseReviewStamp here — checked the same way, only when present
    // (the WO-C1 demo lesson and any lesson authored before WO-C2 predate this field).
    if (lesson.listenReview && !isFullyApproved(lesson.listenReview)) {
      approvalIssues.push(`lesson ${lesson.id} listen: not fully approved (${approvalLabel(lesson.listenReview)})`);
    }
  }

  const lintIssues: string[] = [];
  for (const text of childFacingTexts(lesson)) {
    for (const i of lintChildFacing(text, gradeOf)) lintIssues.push(`[${i.rule}] ${i.message}`);
  }
  for (const text of parentFacingTexts(lesson)) {
    for (const i of lintParentFacing(text, gradeOf)) lintIssues.push(`[${i.rule}] ${i.message} (parent-facing)`);
  }

  const approved = isFullyApproved(lesson.review);
  return {
    approvalIssues,
    contentLintIssues: approved ? lintIssues : [],
    contentLintWarnings: approved ? [] : lintIssues,
  };
}
