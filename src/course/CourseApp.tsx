/**
 * WO-C1: the course shell's own top-level state machine/router — a wholly separate tree from
 * MissionShell/main.tsx (Coordinator: "build a separate course shell with its own entry and
 * route... do not generalise MissionShell or main.tsx"). Reuses AD-12 primitives and the shared
 * family/profile/API infrastructure only; writes its own small screen-to-screen transitions
 * rather than the Playground's dig/slot-assembly engine, per WO-C1 §3's own instruction.
 *
 * Gate (WO-C1 §1 / Coordinator): `VITE_COURSE_ENABLED === '1' || me.courseAllowed` — build-time
 * general-availability switch OR the per-family Firestore allowlist, computed once `me` loads.
 */
import { useEffect, useState } from 'react';
import { fetchMe, getCourseProgress, putCourseProgress, type MeResponse } from './api';
import { getProgress } from '../family/api';
import { COURSE_ID } from './courseId';
import { courseManifest, courseUi, demoLesson, getLesson } from './content/courseManifest';
import type { CourseLesson } from './content/types';
import { emptyCourseProgress, emptyLessonProgress, shouldShowSixtyPercentNotice, computeLessonPercent, type CourseProgressState } from './progress';
import { track } from '../engine/analytics';
import moduleJson from '../modules/m1/module.json';
import { CourseHome } from './screens/CourseHome';
import { LessonScreen } from './screens/LessonScreen';
import { ListenScreen } from './screens/ListenScreen';
import { ExerciseScreen } from './screens/ExerciseScreen';
import { MakeScreen } from './screens/MakeScreen';
import { TeachBackScreen } from './screens/TeachBackScreen';
import { FamilyScreen } from './screens/FamilyScreen';
import { ParentScreen } from './screens/ParentScreen';
import './course.css';

const PLAYGROUND_STORY_IDS: string[] = moduleJson.missionOrder;
const COURSE_ENABLED_BUILD_FLAG = import.meta.env.VITE_COURSE_ENABLED === '1';

function resolveLesson(lessonId: string): CourseLesson | undefined {
  return lessonId === demoLesson.id ? demoLesson : getLesson(lessonId);
}

type Screen =
  | { kind: 'home' }
  | { kind: 'lesson'; lessonId: string }
  | { kind: 'listen'; lessonId: string; blockIndex: number }
  | { kind: 'exercise'; lessonId: string; blockIndex: number; index: number }
  | { kind: 'make'; lessonId: string; blockIndex: number }
  | { kind: 'teachback'; lessonId: string }
  | { kind: 'family'; lessonId: string }
  | { kind: 'parent'; focusLessonId: string | null };

/** WO-C2 §2: きくA/きくB and つくるA/つくるB are now scored independently (10 each) — `blockIndex`
 *  0 selects the `A` progress field, 1 selects `B` (the only two tools any lesson teaches so far;
 *  see `CourseLessonProgressState`'s own doc comment). */
function listenFlagKey(blockIndex: number): 'listenADone' | 'listenBDone' {
  return blockIndex === 0 ? 'listenADone' : 'listenBDone';
}
function makeFlagKey(blockIndex: number): 'makeADone' | 'makeBDone' {
  return blockIndex === 0 ? 'makeADone' : 'makeBDone';
}

export function CourseApp() {
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [progress, setProgress] = useState<CourseProgressState | 'loading'>('loading');
  const [playgroundMissionDone, setPlaygroundMissionDone] = useState<Record<string, boolean>>({});
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });

  useEffect(() => {
    fetchMe().then(setMe);
  }, []);

  useEffect(() => {
    if (!profileId) return;
    setProgress('loading');
    getCourseProgress(profileId, COURSE_ID).then((p) => setProgress(p ?? emptyCourseProgress()));
    getProgress(profileId, moduleJson.id).then((p) => {
      if (!p) return;
      setPlaygroundMissionDone(Object.fromEntries(Object.entries(p.missions).map(([id, m]) => [id, m.done])));
    });
  }, [profileId]);

  async function persist(next: CourseProgressState) {
    setProgress(next);
    if (!profileId) return;
    const merged = await putCourseProgress(profileId, COURSE_ID, next);
    if (merged) setProgress(merged);
  }

  function updateProgress(updater: (prev: CourseProgressState) => CourseProgressState) {
    if (progress === 'loading') return;
    void persist(updater(progress));
  }

  if (me === 'loading') return <main className="ad12 course-loading"><p className="ad12-ui-text">{courseUi.loading}</p></main>;
  if (me === null) {
    return (
      <main className="ad12 course-loading">
        <p className="ad12-ui-text">{courseUi.loginRequired}</p>
        <a className="ad12-ink-button ad12-tappable" href="/login/">{courseUi.loginCta}</a>
      </main>
    );
  }
  if (!COURSE_ENABLED_BUILD_FLAG && !me.courseAllowed) {
    return (
      <main className="ad12 course-loading">
        <p className="ad12-ui-text">{courseUi.comingSoon}</p>
      </main>
    );
  }
  if (!profileId) {
    return (
      <main className="ad12 course-loading course-profile-picker">
        <p className="ad12-ui-text">{courseUi.profilePickTitle}</p>
        {me.profiles.map((p, i) => (
          <button key={p.id} type="button" className="ad12-ink-button ad12-tappable" onClick={() => setProfileId(p.id)}>
            {courseUi.profileLabel} {i + 1}
          </button>
        ))}
      </main>
    );
  }
  if (progress === 'loading') return <main className="ad12 course-loading"><p className="ad12-ui-text">{courseUi.loading}</p></main>;

  const reviewInProgress = !me.courseAllowed ? null : courseUi.reviewBadge;

  function markListenDone(lessonId: string, blockIndex: number) {
    updateProgress((prev) => {
      const lesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      track('course_listen_done', { lessonId, block: blockIndex });
      const key = listenFlagKey(blockIndex);
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: { ...lesson, [key]: true, lastStepAt: new Date().toISOString() } } };
    });
  }

  function markItemDone(lessonId: string, exerciseId: string) {
    const lesson = resolveLesson(lessonId);
    updateProgress((prev) => {
      const prevLesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      const percentBefore = lesson ? computeLessonPercent(lesson, prevLesson) : 0;
      const nextLesson = {
        ...prevLesson,
        exercisesDone: Array.from(new Set([...prevLesson.exercisesDone, exerciseId])),
        lastStepAt: new Date().toISOString(),
      };
      const percentAfter = lesson ? computeLessonPercent(lesson, nextLesson) : 0;
      track('course_item_done', { lessonId, exerciseId });
      if (shouldShowSixtyPercentNotice(lessonId, percentBefore, percentAfter, prev.sixtyPercentNoticeShown)) {
        // eslint-disable-next-line no-alert -- WO-C1 §4's own one-time in-flow notice; a real
        // toast/modal component is a screens-polish follow-up, not required for this v1.
        window.alert(courseUi.sixtyPercentNotice);
        return {
          ...prev,
          lessons: { ...prev.lessons, [lessonId]: nextLesson },
          sixtyPercentNoticeShown: [...prev.sixtyPercentNoticeShown, lessonId],
        };
      }
      if (percentAfter >= 100 && percentBefore < 100) track('course_lesson_complete', { lessonId });
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: nextLesson } };
    });
  }

  function markMakeDone(lessonId: string, blockIndex: number) {
    updateProgress((prev) => {
      const lesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      track('course_make_done', { lessonId, block: blockIndex });
      const key = makeFlagKey(blockIndex);
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: { ...lesson, [key]: true, lastStepAt: new Date().toISOString() } } };
    });
  }

  function markTeachBackDone(lessonId: string) {
    updateProgress((prev) => {
      const lesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      track('course_teachback_done', { lessonId });
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: { ...lesson, teachBackDone: true, lastStepAt: new Date().toISOString() } } };
    });
  }

  function addStar(lessonId: string) {
    updateProgress((prev) => {
      const lesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      track('course_family_star', { lessonId });
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: { ...lesson, stars: lesson.stars + 1 } } };
    });
  }

  function earlyUnlock(partId: string) {
    if (progress === 'loading') return;
    if (progress.earlyUnlockedParts.includes(partId)) return;
    void persist({ ...progress, earlyUnlockedParts: [...progress.earlyUnlockedParts, partId] });
  }

  if (screen.kind === 'home') {
    return (
      <>
        {reviewInProgress && <div className="course-review-badge ad12-ui-text">{reviewInProgress}</div>}
        <CourseHome
          manifest={courseManifest}
          progress={progress}
          getLesson={getLesson}
          playgroundStoryIds={PLAYGROUND_STORY_IDS}
          playgroundMissionDone={playgroundMissionDone}
          onOpenPlayground={() => { window.location.href = '/play/'; }}
          onOpenLesson={(lessonId) => { track('course_lesson_start', { lessonId }); setScreen({ kind: 'lesson', lessonId }); }}
          onOpenParent={() => setScreen({ kind: 'parent', focusLessonId: null })}
          onOpenDemo={() => { track('course_lesson_start', { lessonId: demoLesson.id }); setScreen({ kind: 'lesson', lessonId: demoLesson.id }); }}
        />
      </>
    );
  }

  if (screen.kind === 'parent') {
    return (
      <ParentScreen
        manifest={courseManifest}
        progress={progress}
        getLesson={getLesson}
        focusLessonId={screen.focusLessonId}
        onEarlyUnlock={earlyUnlock}
        onBack={() => setScreen({ kind: 'home' })}
      />
    );
  }

  const lesson = resolveLesson(screen.lessonId);
  if (!lesson) return null; // unreachable in practice: every screen transition below only ever targets a resolvable lessonId
  const lessonProgress = progress.lessons[screen.lessonId];
  const lessonUnapproved = !(lesson.review.philosophy === 'approved' && lesson.review.japanese === 'approved');
  const showBadge = me.courseAllowed && lessonUnapproved;

  let content: JSX.Element | null = null;
  if (screen.kind === 'lesson') {
    content = (
      <LessonScreen
        lesson={lesson}
        progress={lessonProgress}
        onOpenListen={(blockIndex) => setScreen({ kind: 'listen', lessonId: lesson.id, blockIndex })}
        onOpenExercise={(blockIndex) => setScreen({ kind: 'exercise', lessonId: lesson.id, blockIndex, index: 0 })}
        onOpenMake={() => setScreen({ kind: 'make', lessonId: lesson.id, blockIndex: 0 })}
        onOpenTeachBack={() => setScreen({ kind: 'teachback', lessonId: lesson.id })}
        onOpenFamily={() => setScreen({ kind: 'family', lessonId: lesson.id })}
        onBack={() => setScreen({ kind: 'home' })}
      />
    );
  } else if (screen.kind === 'listen') {
    const block = lesson.listen[screen.blockIndex];
    if (!block) { setScreen({ kind: 'lesson', lessonId: lesson.id }); return null; }
    content = (
      <ListenScreen
        key={screen.blockIndex}
        lessonTitle={lesson.title}
        block={block}
        onDone={() => { markListenDone(lesson.id, screen.blockIndex); setScreen({ kind: 'lesson', lessonId: lesson.id }); }}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
      />
    );
  } else if (screen.kind === 'exercise') {
    const block = lesson.listen[screen.blockIndex];
    const exerciseId = block?.thenExercises[screen.index];
    const exercise = lesson.exercises.find((e) => e.id === exerciseId);
    if (!block || !exercise) { setScreen({ kind: 'lesson', lessonId: lesson.id }); return null; }
    content = (
      <ExerciseScreen
        key={`${screen.blockIndex}-${screen.index}`}
        exercise={exercise}
        position={{ index: screen.index, total: block.thenExercises.length }}
        onItemDone={(id) => markItemDone(lesson.id, id)}
        onNext={() => {
          const nextIndex = screen.index + 1;
          if (nextIndex >= block.thenExercises.length) setScreen({ kind: 'lesson', lessonId: lesson.id });
          else setScreen({ kind: 'exercise', lessonId: lesson.id, blockIndex: screen.blockIndex, index: nextIndex });
        }}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
      />
    );
  } else if (screen.kind === 'make') {
    content = (
      <MakeScreen
        key={screen.blockIndex}
        lessonId={lesson.id}
        blocks={lesson.make}
        blockIndex={screen.blockIndex}
        onMakeDone={() => markMakeDone(lesson.id, screen.blockIndex)}
        onNextBlock={() => {
          const nextIndex = screen.blockIndex + 1;
          if (nextIndex >= lesson.make.length) setScreen({ kind: 'lesson', lessonId: lesson.id });
          else setScreen({ kind: 'make', lessonId: lesson.id, blockIndex: nextIndex });
        }}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
      />
    );
  } else if (screen.kind === 'teachback') {
    content = (
      <TeachBackScreen
        lessonId={lesson.id}
        teachBack={lesson.teachBack}
        onTeachBackDone={() => { markTeachBackDone(lesson.id); setScreen({ kind: 'lesson', lessonId: lesson.id }); }}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
      />
    );
  } else if (screen.kind === 'family') {
    content = (
      <FamilyScreen
        lessonId={lesson.id}
        family={lesson.family}
        stars={lessonProgress?.stars ?? 0}
        starsEnabled={!!lessonProgress?.teachBackDone}
        onStar={() => addStar(lesson.id)}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
      />
    );
  }
  if (!content) return null;
  return (
    <>
      {showBadge && <div className="course-review-badge ad12-ui-text">{courseUi.reviewBadge}</div>}
      {content}
    </>
  );
}
