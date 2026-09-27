/**
 * WO-C5 §4/§11 — unit coverage for the beginner course's own progress math: きく30・れんしゅう50・
 * チェック20 = 100, ★ never required for 100%, sequential step unlocks, and final-page gating
 * (all 7 lessons at 100%). Plus the licence predicate (WO-C5 §6).
 */
import { describe, it, expect } from 'vitest';
import {
  computeBeginnerLessonPercent, computeBeginnerStepUnlocks, allBeginnerLessonsComplete,
  emptyLessonProgress, type CourseLessonProgress,
} from '../src/course/progress';
import type { CourseBeginnerLesson } from '../src/course/content/types';
import { isBeginnerCourseLicensed } from '../src/course/beginnerLicence';
import type { MeResponse } from '../src/course/api';

function fakeBeginnerLesson(exerciseCount: number, auditCount: number): CourseBeginnerLesson {
  return {
    id: 'b01',
    course: 'beginner',
    title: 't',
    tool: 'A',
    listen: { tool: 'A', audio: 'a.mp3', methodCards: ['A'], transcript: [], thenExercises: [], toolCard: { when: '', how: '' } },
    exercises: Array.from({ length: exerciseCount }, (_, i) => ({
      id: `b01-e${i + 1}`,
      tool: 'A',
      scene: { text: 's' },
      q0: { speaker: 'ポン太', text: 'q' },
      steps: [],
      review: { model: 'pass', philosophy: null, japanese: null },
    })),
    audit: Array.from({ length: auditCount }, (_, i) => ({
      id: `k${i + 1}`,
      scene: 's',
      q0: ['ポン太', 'q'],
      answer: ['お母さん', 'a'],
      prompt: 'p',
      cards: [['ok', 'x', 'y']],
    })),
    home: { title: 't', steps: [], wordHints: [], button: 'b', parentNote: 'n' },
    review: { model: 'pass', philosophy: null, japanese: null },
  };
}

describe('computeBeginnerLessonPercent', () => {
  it('is 0 with no progress at all', () => {
    const lesson = fakeBeginnerLesson(5, 4);
    expect(computeBeginnerLessonPercent(lesson, undefined)).toBe(0);
    expect(computeBeginnerLessonPercent(lesson, emptyLessonProgress())).toBe(0);
  });

  it('きく is worth 30', () => {
    const lesson = fakeBeginnerLesson(5, 4);
    const p: CourseLessonProgress = { ...emptyLessonProgress(), listenADone: true };
    expect(computeBeginnerLessonPercent(lesson, p)).toBe(30);
  });

  it('れんしゅう is worth 50 total, split evenly (5 items -> 10 each)', () => {
    const lesson = fakeBeginnerLesson(5, 4);
    const p: CourseLessonProgress = { ...emptyLessonProgress(), exercisesDone: ['b01-e1', 'b01-e2'] };
    expect(computeBeginnerLessonPercent(lesson, p)).toBe(20); // 2 * 10
  });

  it('チェック is worth 20 total, split evenly (4 items -> 5 each)', () => {
    const lesson = fakeBeginnerLesson(5, 4);
    const p: CourseLessonProgress = { ...emptyLessonProgress(), exercisesDone: ['k1', 'k2', 'k3'] };
    expect(computeBeginnerLessonPercent(lesson, p)).toBe(15); // 3 * 5
  });

  it('reaches exactly 100 when listen + all exercises + all audit items are done, with ★ = 0', () => {
    const lesson = fakeBeginnerLesson(5, 4);
    const p: CourseLessonProgress = {
      ...emptyLessonProgress(),
      listenADone: true,
      exercisesDone: [...lesson.exercises.map((e) => e.id), ...lesson.audit.map((a) => a.id)],
      stars: 0,
    };
    expect(computeBeginnerLessonPercent(lesson, p)).toBe(100);
  });

  it('★ (home.button press) is never required for 100% — omitting it changes nothing', () => {
    const lesson = fakeBeginnerLesson(5, 4);
    const withStar: CourseLessonProgress = {
      ...emptyLessonProgress(), listenADone: true,
      exercisesDone: [...lesson.exercises.map((e) => e.id), ...lesson.audit.map((a) => a.id)],
      stars: 1,
    };
    const withoutStar: CourseLessonProgress = { ...withStar, stars: 0 };
    expect(computeBeginnerLessonPercent(lesson, withStar)).toBe(100);
    expect(computeBeginnerLessonPercent(lesson, withoutStar)).toBe(100);
  });

  it('exercise ids and audit ids never collide, so both can be 100% independently done', () => {
    const lesson = fakeBeginnerLesson(2, 2);
    const onlyAudit: CourseLessonProgress = { ...emptyLessonProgress(), exercisesDone: ['k1', 'k2'] };
    expect(computeBeginnerLessonPercent(lesson, onlyAudit)).toBe(20); // audit only, exercises untouched
  });
});

describe('computeBeginnerStepUnlocks — きく->れんしゅう->チェック->おうちで', () => {
  it('きく is always unlocked; れんしゅう opens only once きく is done', () => {
    const lesson = fakeBeginnerLesson(2, 2);
    expect(computeBeginnerStepUnlocks(lesson, undefined).listen).toBe(true);
    expect(computeBeginnerStepUnlocks(lesson, undefined).exercise).toBe(false);
    const p: CourseLessonProgress = { ...emptyLessonProgress(), listenADone: true };
    expect(computeBeginnerStepUnlocks(lesson, p).exercise).toBe(true);
  });

  it('チェック opens only once every practice item is done', () => {
    const lesson = fakeBeginnerLesson(2, 2);
    const partial: CourseLessonProgress = { ...emptyLessonProgress(), listenADone: true, exercisesDone: ['b01-e1'] };
    expect(computeBeginnerStepUnlocks(lesson, partial).audit).toBe(false);
    const full: CourseLessonProgress = { ...emptyLessonProgress(), listenADone: true, exercisesDone: ['b01-e1', 'b01-e2'] };
    expect(computeBeginnerStepUnlocks(lesson, full).audit).toBe(true);
  });

  it('おうちで opens only once every audit item is done', () => {
    const lesson = fakeBeginnerLesson(2, 2);
    const partial: CourseLessonProgress = {
      ...emptyLessonProgress(), listenADone: true, exercisesDone: ['b01-e1', 'b01-e2', 'k1'],
    };
    expect(computeBeginnerStepUnlocks(lesson, partial).home).toBe(false);
    const full: CourseLessonProgress = {
      ...emptyLessonProgress(), listenADone: true, exercisesDone: ['b01-e1', 'b01-e2', 'k1', 'k2'],
    };
    expect(computeBeginnerStepUnlocks(lesson, full).home).toBe(true);
  });
});

describe('allBeginnerLessonsComplete — final-page gating', () => {
  it('is false with fewer than 7 lessons at 100%', () => {
    expect(allBeginnerLessonsComplete([100, 100, 100, 100, 100, 100, 99])).toBe(false);
  });

  it('is true only once every lesson is at exactly 100%', () => {
    expect(allBeginnerLessonsComplete(Array(7).fill(100))).toBe(true);
  });

  it('is false for an empty list — nothing to have finished', () => {
    expect(allBeginnerLessonsComplete([])).toBe(false);
  });
});

describe('isBeginnerCourseLicensed — WO-C5 §6, existing Module 1 licences count', () => {
  function fakeMe(entitlements: MeResponse['entitlements']): MeResponse {
    return { familyId: 'f1', email: 'a@b.com', entitlements, profiles: [], trials: [], courseAllowed: false };
  }

  it('is false with no entitlements at all', () => {
    expect(isBeginnerCourseLicensed(fakeMe([]))).toBe(false);
  });

  it('is true for an active `m1` entitlement — the SAME SKU as the Playground, bought before or after this course existed', () => {
    expect(isBeginnerCourseLicensed(fakeMe([{ moduleId: 'm1', status: 'active', grantedAt: '2026-01-01' }]))).toBe(true);
  });

  it('is false for a revoked/refunded `m1` entitlement', () => {
    expect(isBeginnerCourseLicensed(fakeMe([{ moduleId: 'm1', status: 'revoked', grantedAt: '2026-01-01' }]))).toBe(false);
  });

  it('is false for an entitlement to some other module', () => {
    expect(isBeginnerCourseLicensed(fakeMe([{ moduleId: 'm2', status: 'active', grantedAt: '2026-01-01' }]))).toBe(false);
  });
});
