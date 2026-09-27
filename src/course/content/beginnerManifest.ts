/**
 * WO-C5: the beginner course's own manifest/lesson loader — separate from `courseManifest.ts`
 * (which stays untouched, `stage2`/c01-c12 only). Same "explicit one-line import per lesson, never
 * a glob" discipline as that file.
 */
import beginnerCourseJson from './lessons/beginner.course.json';
import b01Json from './lessons/b01.lesson.json';
import b02Json from './lessons/b02.lesson.json';
import b03Json from './lessons/b03.lesson.json';
import b04Json from './lessons/b04.lesson.json';
import b05Json from './lessons/b05.lesson.json';
import b06Json from './lessons/b06.lesson.json';
import b07Json from './lessons/b07.lesson.json';
import bEndingJson from './lessons/b-ending.json';
import type { CourseBeginnerLesson, CourseBeginnerManifest, CourseEndingLesson } from './types';

export const beginnerManifest = beginnerCourseJson as unknown as CourseBeginnerManifest;

const lessonsById: Record<string, CourseBeginnerLesson> = {
  b01: b01Json as unknown as CourseBeginnerLesson,
  b02: b02Json as unknown as CourseBeginnerLesson,
  b03: b03Json as unknown as CourseBeginnerLesson,
  b04: b04Json as unknown as CourseBeginnerLesson,
  b05: b05Json as unknown as CourseBeginnerLesson,
  b06: b06Json as unknown as CourseBeginnerLesson,
  b07: b07Json as unknown as CourseBeginnerLesson,
};

export const beginnerEndingLesson: CourseEndingLesson = bEndingJson as unknown as CourseEndingLesson;

export function getBeginnerLesson(lessonId: string): CourseBeginnerLesson | undefined {
  return lessonsById[lessonId];
}

export function allBeginnerLessons(): CourseBeginnerLesson[] {
  return beginnerManifest.parts
    .filter((p) => p.kind === 'lesson')
    .map((p) => lessonsById[p.id])
    .filter((l): l is CourseBeginnerLesson => !!l);
}
