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
import { lintText, type LintIssue } from '../../pipeline/lib/lintText.js';
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

function childFacingTexts(lesson: CourseLesson): string[] {
  const texts: string[] = [lesson.title];
  for (const line of lesson.listen.transcript) texts.push(line.text);
  for (const ex of lesson.exercises) {
    texts.push(ex.scene.text, ex.q0.text);
    for (const step of ex.steps) {
      texts.push(step.answer.text, step.hint.h1);
      for (const opt of step.options) texts.push(opt.text, opt.reply.text, opt.feedback);
    }
  }
  for (const block of lesson.make) {
    for (const line of block.dialogue) texts.push(line.text);
    texts.push(...block.starterCards, ...block.selfCheck);
  }
  texts.push(lesson.teachBack.prompt);
  return texts;
}

function parentFacingTexts(lesson: CourseLesson): string[] {
  const texts: string[] = [];
  for (const block of lesson.make) {
    for (const p of block.parentPrompts) texts.push(p.text);
    texts.push(...block.parentPeek);
  }
  texts.push(lesson.family.whoKnows, lesson.family.aiExample, lesson.family.applyTool, ...lesson.family.notes);
  texts.push(lesson.parentCard.tool, lesson.parentCard.method, lesson.parentCard.dinnerQuestion);
  return texts;
}

/**
 * Architect correction (post-report): `pii-word` legitimately false-positives on a sentence
 * whose whole point IS telling a family not to share personal data — e.g. family.notes's own
 * 「AI には、名前や 学校名、じゅうしょを 入れない」 mentions 学校名/じゅうしょ to warn against
 * them, not to request them. Loosening the lint itself was rejected — instead, an EXACT-match
 * allowlist of full sentences already vetted as safety instructions, never a substring/prefix
 * match, so a genuinely PII-requesting sentence that happens to share a few characters can never
 * slip through. Every entry here was explicitly approved by the Coordinator; adding a new one
 * needs the same sign-off — never add to this list unilaterally.
 */
const PII_SAFE_SENTENCES: readonly string[] = [
  'AI には、名前や 学校名、じゅうしょを 入れない',
];

function dropAllowlistedPii(issues: LintIssue[], text: string): LintIssue[] {
  if (!PII_SAFE_SENTENCES.includes(text)) return issues;
  return issues.filter((i) => i.rule !== 'pii-word');
}

function lintChildFacing(text: string, gradeOf: GradeMap): LintIssue[] {
  const issues = lintText(text, COURSE_STAGE, gradeOf, { kanjiFloor: true }).filter((i) => i.rule !== 'length');
  return dropAllowlistedPii([...issues, ...checkSentenceLengths(text, COURSE_STAGE)], text);
}

/** Parent-facing text: banned/PII checks only (`lintText`'s kanji-grade/ruby/length rules are
 *  child-audience rules — see file header) — reuse `lintText` but discard anything that isn't a
 *  banned/PII-word finding. */
function lintParentFacing(text: string, gradeOf: GradeMap): LintIssue[] {
  const issues = lintText(text, COURSE_STAGE, gradeOf).filter((i) => i.rule === 'banned-word' || i.rule === 'pii-word');
  return dropAllowlistedPii(issues, text);
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
