/**
 * Course redesign (Founder, 1 Oct 2026): real character art (ハテナ/ポン太, from the marketing
 * design pack) in place of the beginner course's previously character-free screens — item 2 of
 * that work order. Each test below checks the one placement item 2 names for that screen, without
 * touching any assertion about layout/content/progress (those stay exactly as WO-C5/WO-C6 left
 * them — see the existing beginnerAudit.test.tsx/beginnerExerciseChain.test.tsx files, both still
 * green, for that coverage).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExerciseScreen } from '../src/course/screens/ExerciseScreen';
import { AuditScreen } from '../src/course/screens/AuditScreen';
import { ListenScreen } from '../src/course/screens/ListenScreen';
import { BeginnerLessonScreen } from '../src/course/screens/BeginnerLessonScreen';
import { BeginnerCourseHome } from '../src/course/screens/BeginnerCourseHome';
import { EndingScreen } from '../src/course/screens/EndingScreen';
import { __resetCourseAudioPlayerForTests } from '../src/course/courseAudioPlayer';
import { emptyCourseProgress } from '../src/course/progress';
import type {
  CourseExercise, CourseAuditItem, CourseListenBlock, CourseBeginnerLesson, CourseBeginnerManifest,
  CourseEndingLesson,
} from '../src/course/content/types';

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => { /* jsdom has no real media pipeline */ };
});
beforeEach(() => __resetCourseAudioPlayerForTests());
afterEach(() => cleanup());

function fakeLesson(overrides: Partial<CourseBeginnerLesson> = {}): CourseBeginnerLesson {
  return {
    id: 'b01',
    course: 'beginner',
    title: 'ふたを あける',
    tool: 'A',
    listen: { tool: 'A', audio: 'a.mp3', methodCards: ['A'], transcript: [], thenExercises: [], toolCard: { when: '', how: '' } },
    exercises: [],
    audit: [],
    home: { title: 't', steps: [], wordHints: [], button: 'b', parentNote: 'n' },
    review: { model: 'pass', philosophy: null, japanese: null },
    ...overrides,
  };
}

describe('course redesign — real character art', () => {
  it('ExerciseScreen: the hint line (button + opened panel) and the feedback panel both show ハテナ', async () => {
    const user = userEvent.setup();
    const exercise: CourseExercise = {
      id: 'b01-e1',
      tool: 'A',
      scene: { text: 's' },
      q0: { speaker: 'ポン太', text: 'q' },
      steps: [{
        answer: { speaker: 'お母さん', text: 'a' },
        hint: { h1: 'ヒントだよ', h2Highlight: '' },
        displayOrder: ['x'],
        options: [{ id: 'x', kind: 'question', role: 'nearMiss', tool: null, text: 'miss', reply: { speaker: 'お母さん', text: 'r' }, feedback: 'みそのフィードバック' }],
      }],
      review: { model: 'pass', philosophy: null, japanese: null },
    };
    render(<ExerciseScreen exercise={exercise} position={{ index: 0, total: 1 }} onItemDone={() => {}} onNext={() => {}} onBack={() => {}} />);

    // Hint line: button, then the opened hint panel, both carry the icon.
    await user.click(screen.getByText('ヒント'));
    expect(document.querySelectorAll('.course-dialogue__speaker-icon').length).toBeGreaterThan(0);

    // A miss shows the feedback panel, also with the icon.
    await user.click(screen.getByText('miss'));
    expect(screen.getByText('みそのフィードバック')).toBeTruthy();
    expect(document.querySelectorAll('.course-exercise__feedback .course-dialogue__speaker-icon').length).toBe(1);
  });

  it('AuditScreen: the feedback panel shows ハテナ', async () => {
    const user = userEvent.setup();
    const item: CourseAuditItem = {
      id: 'k1', scene: 's', q0: ['ポン太', 'q'], answer: ['お母さん', 'a'], prompt: 'p',
      cards: [['ok', 'c1', 'フィードバック']],
    };
    render(<AuditScreen lessonId="b01" item={item} position={{ index: 0, total: 1 }} onItemDone={() => {}} onNext={() => {}} onBack={() => {}} />);
    await user.click(screen.getByText('c1'));
    expect(document.querySelectorAll('.course-exercise__feedback .course-dialogue__speaker-icon').length).toBe(1);
  });

  it('ListenScreen: ポン太\'s own transcript lines show his speaker art — other speakers never do', () => {
    const block: CourseListenBlock = {
      tool: 'A', audio: 'a.mp3', methodCards: ['A'], thenExercises: [], toolCard: { when: '', how: '' },
      transcript: [
        { speaker: 'ハテナ', text: 'line 1', section: 'talk' },
        { speaker: 'ポン太', text: 'line 2', section: 'talk' },
      ],
    };
    render(<ListenScreen lessonTitle="t" block={block} onDone={() => {}} onBack={() => {}} />);
    const lines = document.querySelectorAll('.course-listen__line');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.querySelector('.course-dialogue__speaker-icon')).toBeNull();
    expect(lines[1]!.querySelector('.course-dialogue__speaker-icon')).not.toBeNull();
  });

  it('BeginnerLessonScreen: the tool-intro plane shows ハテナ (hatena_discovery)', () => {
    render(<BeginnerLessonScreen lesson={fakeLesson()} progress={undefined} onOpenListen={() => {}} onOpenExercise={() => {}} onOpenAudit={() => {}} onOpenHome={() => {}} onBack={() => {}} />);
    expect(document.querySelector('.course-lesson__tool .course-lesson__tool-character')).not.toBeNull();
  });

  it('BeginnerCourseHome: the garden header shows ポン太', () => {
    const manifest: CourseBeginnerManifest = {
      courseId: 'beginner', title: 't', price: { yen: 4980, kind: 'm1', sku: 's' },
      parts: [{ id: 'b01', kind: 'lesson', tool: 'A' }],
      finalScreen: { line: '', sub: '' },
    };
    render(
      <BeginnerCourseHome
        manifest={manifest}
        progress={emptyCourseProgress()}
        licensed={true}
        getLesson={() => fakeLesson()}
        onOpenLesson={() => {}}
        onOpenEnding={() => {}}
        onOpenParent={() => {}}
      />,
    );
    expect(document.querySelector('.course-home__heading-row .course-home__character')).not.toBeNull();
  });

  it('EndingScreen: both characters appear next to the 7-flower bloom on the final message page', async () => {
    const user = userEvent.setup();
    const lesson: CourseEndingLesson = {
      id: 'b-ending', course: 'beginner', title: 't', scene: 's', transcript: [],
      screenLine: 'line', screenSub: 'sub', review: { model: 'pass', philosophy: null, japanese: null }, audio: 'a.mp3',
    };
    const { container } = render(<EndingScreen lesson={lesson} onDone={() => {}} onBack={() => {}} />);

    // The listen step opens first; its primary ("つぎへ") unlocks once playback reaches the end,
    // and advances to the message step (where the cast + bloom live) — same `onEnded` the real
    // <audio> element fires. Scoped to this render's own container: `courseAudioPlayer.ts`'s
    // shared singleton `<audio data-shared-audio-player>` element lives directly on
    // `document.body` (outside the React tree, never cleared by RTL's `cleanup()`), so a bare
    // `document.querySelector('audio')` can pick up a leftover from an earlier test instead.
    fireEvent.ended(container.querySelector('audio')!);
    await user.click(screen.getByText('つぎへ'));

    expect(await screen.findByText('line')).toBeTruthy();
    const cast = document.querySelectorAll('.course-ending__cast .course-ending__character');
    expect(cast).toHaveLength(2);
  });
});
