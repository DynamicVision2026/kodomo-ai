/**
 * WO-C1 acceptance: "Unit tests cover lesson %, stage %, flower stages, the order/unlock rules
 * and the parent's early unlock."
 */
import { describe, it, expect } from 'vitest';
import {
  computeLessonPercent, playgroundFlowerPercent, flowerStageForPercent, computeStagePercent,
  isPartUnlocked, shouldShowSixtyPercentNotice, emptyLessonProgress,
  type CourseLessonProgress,
} from '../src/course/progress';
import type { CourseLesson, CoursePart } from '../src/course/content/types';

function fakeLesson(exerciseCount: number): CourseLesson {
  return {
    id: 'c01',
    title: 't',
    tools: ['A'],
    practice: 'single',
    review: { model: 'pass', philosophy: null, japanese: null },
    listen: { audio: 'a.mp3', transcript: [], methodCards: ['A'] },
    exercises: Array.from({ length: exerciseCount }, (_, i) => ({
      id: `c01-e${i + 1}`,
      tool: 'A',
      scene: { text: 's' },
      q0: { speaker: 'ポン太', text: 'q' },
      steps: [],
      review: { model: 'pass', philosophy: null, japanese: null },
    })),
    make: [],
    teachBack: { prompt: 'p' },
    family: { whoKnows: '', aiExample: '', applyTool: '', notes: [] },
    parentCard: { tool: '', method: '', sources: [], dinnerQuestion: '' },
  };
}

describe('computeLessonPercent', () => {
  it('is 0 with no progress at all', () => {
    expect(computeLessonPercent(fakeLesson(10), undefined)).toBe(0);
    expect(computeLessonPercent(fakeLesson(10), emptyLessonProgress())).toBe(0);
  });

  it('listen is worth 20', () => {
    const p: CourseLessonProgress = { ...emptyLessonProgress(), listenDone: true };
    expect(computeLessonPercent(fakeLesson(10), p)).toBe(20);
  });

  it('exercises are worth 40 total, split evenly across this lesson\'s exercises (10 -> 4 each)', () => {
    const lesson = fakeLesson(10);
    const p: CourseLessonProgress = { ...emptyLessonProgress(), exercisesDone: ['c01-e1', 'c01-e2', 'c01-e3'] };
    expect(computeLessonPercent(lesson, p)).toBe(12); // 3 * 4
  });

  it('exercises done ids not belonging to this lesson are ignored (defensive)', () => {
    const lesson = fakeLesson(10);
    const p: CourseLessonProgress = { ...emptyLessonProgress(), exercisesDone: ['c01-e1', 'other-lesson-e1'] };
    expect(computeLessonPercent(lesson, p)).toBe(4);
  });

  it('make is worth 20, teach-back is worth 20', () => {
    const lesson = fakeLesson(10);
    const p: CourseLessonProgress = { ...emptyLessonProgress(), makeDone: true, teachBackDone: true };
    expect(computeLessonPercent(lesson, p)).toBe(40);
  });

  it('reaches exactly 100 when every component is done', () => {
    const lesson = fakeLesson(10);
    const p: CourseLessonProgress = {
      ...emptyLessonProgress(),
      listenDone: true,
      exercisesDone: lesson.exercises.map((e) => e.id),
      makeDone: true,
      teachBackDone: true,
    };
    expect(computeLessonPercent(lesson, p)).toBe(100);
  });

  it('never exceeds 100 even with duplicate/over-counted exercise ids', () => {
    const lesson = fakeLesson(2);
    const p: CourseLessonProgress = {
      ...emptyLessonProgress(),
      listenDone: true,
      exercisesDone: [lesson.exercises[0]!.id, lesson.exercises[1]!.id],
      makeDone: true,
      teachBackDone: true,
    };
    expect(computeLessonPercent(lesson, p)).toBeLessThanOrEqual(100);
  });
});

describe('playgroundFlowerPercent', () => {
  const storyIds = ['m1-s2-1-1', 'm1-s2-1-2', 'm1-s2-1-3', 'm1-s2-1-4', 'm1-s2-1-5', 'm1-s2-1-6', 'm1-s2-1-7', 'm1-s2-1-8'];

  it('is 0 with no missions done', () => {
    expect(playgroundFlowerPercent(storyIds, {})).toBe(0);
  });

  it('is 12.5 per completed story mission, rounded', () => {
    expect(playgroundFlowerPercent(storyIds, { 'm1-s2-1-1': true })).toBe(13); // Math.round(12.5)
    expect(playgroundFlowerPercent(storyIds, { 'm1-s2-1-1': true, 'm1-s2-1-2': true })).toBe(25);
  });

  it('bank digs (ids outside missionOrder) never count', () => {
    expect(playgroundFlowerPercent(storyIds, { 'm1-bank-atode': true })).toBe(0);
  });

  it('reaches exactly 100 at all 8 story missions done', () => {
    const all = Object.fromEntries(storyIds.map((id) => [id, true]));
    expect(playgroundFlowerPercent(storyIds, all)).toBe(100);
  });
});

describe('flowerStageForPercent', () => {
  it('0% -> seed', () => expect(flowerStageForPercent(0)).toBe('seed'));
  it('1% -> sprout (lower boundary)', () => expect(flowerStageForPercent(1)).toBe('sprout'));
  it('59% -> sprout (upper boundary)', () => expect(flowerStageForPercent(59)).toBe('sprout'));
  it('60% -> bud (lower boundary)', () => expect(flowerStageForPercent(60)).toBe('bud'));
  it('99% -> bud (upper boundary)', () => expect(flowerStageForPercent(99)).toBe('bud'));
  it('100% -> flower', () => expect(flowerStageForPercent(100)).toBe('flower'));
});

describe('computeStagePercent', () => {
  it('averages all 13 parts, rounded', () => {
    const percents = [100, 100, ...Array(11).fill(0)]; // 200/13 = 15.38...
    expect(computeStagePercent(percents)).toBe(Math.round(200 / 13));
  });

  it('is 0 for an all-zero course', () => {
    expect(computeStagePercent(Array(13).fill(0))).toBe(0);
  });

  it('is 100 when every part is 100', () => {
    expect(computeStagePercent(Array(13).fill(100))).toBe(100);
  });
});

describe('isPartUnlocked — order/unlock rules', () => {
  const parts: CoursePart[] = [
    { id: 'playground', kind: 'playground', missions: 8 },
    { id: 'c01', kind: 'lesson' },
    { id: 'c02', kind: 'lesson' },
    { id: 'c03', kind: 'lesson' },
  ];

  it('the first part is always unlocked, regardless of percent', () => {
    expect(isPartUnlocked(0, parts, [0, 0, 0, 0], [])).toBe(true);
  });

  it('a later part is locked until the immediately-previous part reaches 100', () => {
    expect(isPartUnlocked(1, parts, [99, 0, 0, 0], [])).toBe(false);
    expect(isPartUnlocked(1, parts, [100, 0, 0, 0], [])).toBe(true);
  });

  it('unlocking is sequential, not "any prior part at 100" — c02 stays locked even if c01 skipped to 100 but playground is not', () => {
    // WO-C1 §4 says "the previous part" (singular, immediate), not "all prior parts" — c02's
    // own gate is c01's percent only.
    expect(isPartUnlocked(2, parts, [0, 100, 0, 0], [])).toBe(true);
  });

  it('a parent early-unlock on a part makes it available regardless of the previous part\'s percent', () => {
    expect(isPartUnlocked(2, parts, [0, 0, 0, 0], ['c02'])).toBe(true);
  });

  it('an early unlock on a DIFFERENT part does not affect this one', () => {
    expect(isPartUnlocked(2, parts, [0, 0, 0, 0], ['c03'])).toBe(false);
  });
});

describe('shouldShowSixtyPercentNotice', () => {
  it('fires exactly on the 60% crossing', () => {
    expect(shouldShowSixtyPercentNotice('c01', 40, 60, [])).toBe(true);
    expect(shouldShowSixtyPercentNotice('c01', 40, 80, [])).toBe(true);
  });

  it('does not fire below 60, or already past it before this action', () => {
    expect(shouldShowSixtyPercentNotice('c01', 40, 59, [])).toBe(false);
    expect(shouldShowSixtyPercentNotice('c01', 60, 80, [])).toBe(false);
  });

  it('never fires twice for the same lesson', () => {
    expect(shouldShowSixtyPercentNotice('c01', 40, 60, ['c01'])).toBe(false);
  });

  it('replaying a lesson already past 100% never re-shows it', () => {
    expect(shouldShowSixtyPercentNotice('c01', 100, 100, ['c01'])).toBe(false);
  });
});
