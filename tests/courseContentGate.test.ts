/** WO-C1 §5: unit coverage for the course content gate's pure logic (scripts/lib/courseContentGate.ts). */
import { describe, it, expect } from 'vitest';
import { checkCourseLesson, isFullyApproved } from '../scripts/lib/courseContentGate';
import type { GradeMap } from '../pipeline/lib/kanji';
import type { CourseLesson } from '../src/course/content/types';

const gradeOf: GradeMap = new Map(); // empty grade map -> every kanji treated as grade 7 (表外)

function baseLesson(overrides: Partial<CourseLesson> = {}): CourseLesson {
  return {
    id: 'c01',
    title: 'げんきに あそぼう',
    tools: ['A'],
    practice: 'single',
    review: { model: 'pass', philosophy: null, japanese: null },
    listen: { audio: 'a.mp3', transcript: [{ speaker: 'ポン太', text: 'こんにちは' }], methodCards: ['A'] },
    exercises: [
      {
        id: 'c01-e01',
        tool: 'A',
        scene: { text: 'ばめん' },
        q0: { speaker: 'ポン太', text: 'しつもん' },
        steps: [{
          answer: { speaker: 'おかあさん', text: 'げんきに あそぼうね' },
          hint: { h1: 'ひんと', h2Highlight: 'げんきに' },
          options: [{ id: 'a', role: 'best', kind: 'question', tool: 'A', text: 'しつもん', reply: { speaker: 'おかあさん', text: 'へんじ' }, feedback: 'ふぃーどばっく' }],
        }],
        review: { model: 'pass', philosophy: null, japanese: null },
      },
    ],
    make: [],
    teachBack: { prompt: 'ぷろんぷと' },
    family: { whoKnows: '', aiExample: '', applyTool: '', notes: [] },
    parentCard: { tool: '', method: '', sources: [], dinnerQuestion: '' },
    ...overrides,
  };
}

describe('isFullyApproved', () => {
  it('requires BOTH philosophy and japanese approved', () => {
    expect(isFullyApproved({ model: 'pass', philosophy: 'approved', japanese: 'approved' })).toBe(true);
    expect(isFullyApproved({ model: 'pass', philosophy: 'approved', japanese: null })).toBe(false);
    expect(isFullyApproved({ model: 'pass', philosophy: null, japanese: 'approved' })).toBe(false);
    expect(isFullyApproved(null)).toBe(false);
    expect(isFullyApproved(undefined)).toBe(false);
  });
});

describe('checkCourseLesson — approvalIssues (WO-C1 §5: "fails the build ... in a production build")', () => {
  it('non-strict: an unapproved lesson never produces approvalIssues', () => {
    const result = checkCourseLesson(baseLesson(), gradeOf, { strict: false });
    expect(result.approvalIssues).toEqual([]);
  });

  it('strict: an unapproved lesson fails', () => {
    const result = checkCourseLesson(baseLesson(), gradeOf, { strict: true });
    expect(result.approvalIssues.length).toBeGreaterThan(0);
  });

  it('strict: a fully-approved lesson with a fully-approved exercise passes', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
    });
    lesson.exercises[0]!.review = { model: 'pass', philosophy: 'approved', japanese: 'approved' };
    const result = checkCourseLesson(lesson, gradeOf, { strict: true });
    expect(result.approvalIssues).toEqual([]);
  });

  it('strict: a lesson approved overall but with one unapproved exercise still fails, naming the exercise', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
    });
    // exercise review left at null/null
    const result = checkCourseLesson(lesson, gradeOf, { strict: true });
    expect(result.approvalIssues.some((i) => i.includes('c01-e01'))).toBe(true);
  });
});

describe('checkCourseLesson — content lint gating (approved lessons only fail on lint issues)', () => {
  it('an unapproved lesson with lint problems gets warnings, never failures', () => {
    const lesson = baseLesson({ title: 'x'.repeat(50) }); // way over any sentence-length limit
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues).toEqual([]);
    expect(result.contentLintWarnings.length).toBeGreaterThan(0);
  });

  it('a FULLY APPROVED lesson with the same lint problem fails instead', () => {
    const lesson = baseLesson({
      title: 'x'.repeat(50),
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.length).toBeGreaterThan(0);
    expect(result.contentLintWarnings).toEqual([]);
  });

  it('banned/PII words are caught even in parent-facing fields (family/parentCard)', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      family: { whoKnows: '住所を きいて みよう', aiExample: '', applyTool: '', notes: [] },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('pii-word'))).toBe(true);
  });

  it('a clean, short, approved lesson produces no lint issues', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      teachBack: { prompt: 'げんきに はなそう' }, // avoids kanji-floor words like こたえ/なに
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues).toEqual([]);
  });
});
