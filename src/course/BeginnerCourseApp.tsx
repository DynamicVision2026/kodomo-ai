/**
 * WO-C5 — 入門コース's own top-level state machine/router, a SEPARATE tree from `CourseApp.tsx`
 * (stage2/c01-c12) — same "own entry, own route, never generalise the existing shell" discipline
 * WO-C1 itself established for the course shell vs. MissionShell. Reuses the same family/profile/
 * progress infrastructure (`fetchMe`/`getCourseProgress`/`putCourseProgress`), just against
 * `BEGINNER_COURSE_ID` instead of `COURSE_ID`.
 *
 * WO-C5 §6/§7 — two independent gates, checked in order:
 * 1. `BEGINNER_LAUNCH` (`VITE_BEGINNER_LAUNCH === '1' || me.courseAllowed`) — the same
 *    allowlist/build-flag mechanism `COURSE_ENABLED`/`courseAllowed` already gates stage2 with.
 *    Off in production until the Founder switches it on; staff/allowlisted families see it early.
 * 2. Once past the launch gate, `licensed` (an active `m1` entitlement — WO's own "existing
 *    Module 1 licences count") decides whether the garden's lessons are actually openable or
 *    shown locked with the purchase CTA (`BeginnerCourseHome`'s own `licensed` prop) — never a
 *    second screen, so a family always sees the same garden shape either way.
 */
import { useEffect, useState } from 'react';
import presets from '../../shared/presets.json';
import { fetchMe, getCourseProgress, putCourseProgress, recordCourseLessonOpen, type MeResponse } from './api';
import { BEGINNER_COURSE_ID } from './beginnerCourseId';
import { isBeginnerCourseLicensed, isLessonAccessible, freeSampleLessonIds, FREE_SAMPLE_LESSON_ID } from './beginnerLicence';
import { beginnerManifest, beginnerEndingLesson, getBeginnerLesson } from './content/beginnerManifest';
import { courseUi } from './content/courseManifest';
import { emptyCourseProgress, emptyLessonProgress, type CourseProgressState } from './progress';
import { track } from '../engine/analytics';
import { BeginnerCourseHome } from './screens/BeginnerCourseHome';
import { BeginnerLessonScreen } from './screens/BeginnerLessonScreen';
import { BeginnerParentScreen } from './screens/BeginnerParentScreen';
import { ListenScreen } from './screens/ListenScreen';
import { ExerciseScreen } from './screens/ExerciseScreen';
import { AuditScreen } from './screens/AuditScreen';
import { HomeTaskScreen } from './screens/HomeTaskScreen';
import { EndingScreen } from './screens/EndingScreen';
import './course.css';

const BEGINNER_LAUNCH_BUILD_FLAG = import.meta.env.VITE_BEGINNER_LAUNCH === '1';
/** "Playground hidden; Lesson 1 is the free sample" — see beginnerLicence.ts's own doc comment.
 *  Bypasses gate 1 below (the course is reachable to every logged-in, consented family once this
 *  is on, not just BEGINNER_LAUNCH/courseAllowed families) — gate 2 (the licence) is unaffected;
 *  `isLessonAccessible` is what actually makes Lesson 1 openable without it. */
const PLAYGROUND_HIDDEN_BUILD_FLAG = import.meta.env.VITE_PLAYGROUND_HIDDEN === '1';

type Screen =
  | { kind: 'home' }
  | { kind: 'lesson'; lessonId: string }
  | { kind: 'listen'; lessonId: string }
  | { kind: 'exercise'; lessonId: string; index: number }
  | { kind: 'audit'; lessonId: string; index: number }
  | { kind: 'home-task'; lessonId: string }
  | { kind: 'ending' }
  | { kind: 'parent'; focusLessonId: string | null };

export function BeginnerCourseApp() {
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [progress, setProgress] = useState<CourseProgressState | 'loading'>('loading');
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });

  useEffect(() => {
    fetchMe().then(setMe);
  }, []);

  useEffect(() => {
    if (!profileId) return;
    setProgress('loading');
    getCourseProgress(profileId, BEGINNER_COURSE_ID).then((p) => setProgress(p ?? emptyCourseProgress()));
  }, [profileId]);

  async function persist(next: CourseProgressState) {
    setProgress(next);
    if (!profileId) return;
    const merged = await putCourseProgress(profileId, BEGINNER_COURSE_ID, next);
    if (merged) setProgress(merged);
  }

  function updateProgress(updater: (prev: CourseProgressState) => CourseProgressState) {
    if (progress === 'loading') return;
    void persist(updater(progress));
  }

  if (me === 'loading') return <main className="ad12 course-loading"><p className="ad12-ui-text">{courseUi.loading}</p></main>;
  if (me === null) {
    // WO-C5 follow-up: `?next=` (LoginPage.tsx's own `resolveNextPath`, already used by
    // src/lp/LandingPage.tsx and src/shell/MissionShell.tsx the exact same way) sends the parent
    // back to THIS page after login instead of falling back to /play/ — `window.location.pathname`
    // is always same-origin/relative by construction, and `resolveNextPath` itself still refuses
    // anything that isn't (`next.startsWith('/') && !next.startsWith('//')`), so this can never
    // become an open redirect.
    const next = `${window.location.pathname}${window.location.search}`;
    return (
      <main className="ad12 course-loading">
        <p className="ad12-ui-text">{courseUi.loginRequired}</p>
        <a className="ad12-ink-button ad12-tappable" href={`/login/?next=${encodeURIComponent(next)}`}>{courseUi.loginCta}</a>
      </main>
    );
  }
  // Item 3 ("Lesson 1 requires login and consent"): login is already required above (`me ===
  // null`); a logged-in family with no recorded consent (a legacy pre-consent-system account —
  // every new login already requires agreeing, per LoginPage.tsx's own consent block) is sent to
  // agree before seeing any course content, same redirect AccountPage.tsx's own
  // `sendToConsentIfMissing` already uses.
  if (!me.consentRecorded) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login/?reconsent=1&next=${encodeURIComponent(next)}`;
    return <main className="ad12 course-loading"><p className="ad12-ui-text">{courseUi.loading}</p></main>;
  }
  if (!BEGINNER_LAUNCH_BUILD_FLAG && !me.courseAllowed && !PLAYGROUND_HIDDEN_BUILD_FLAG) {
    return (
      <main className="ad12 course-loading">
        <p className="ad12-ui-text">{courseUi.comingSoon}</p>
      </main>
    );
  }
  if (!profileId) {
    // WO-C6 Push B §1: real avatar + preset nickname tiles (never 「プロフィールN」), big enough to
    // tap from the sofa. A single profile gets the one-yellow ring — with no "last used" state
    // tracked anywhere today, ringing the single real choice is the one case this can say
    // "your turn" without inventing new cross-session state (out of this push's own "no flow
    // change" scope). 「ふやす」 stays a dashed, non-interactive capacity note, matching the design's
    // own build note ("dashed, not a button") — real profile creation isn't wired here.
    return (
      <main className="ad12 course-loading course-profile-picker">
        <p className="ad12-ui-text course-profile-picker__brand">{courseUi.siteHeaderBrandLabel}</p>
        <h1 className="ad12-reading-text course-profile-picker__title">{courseUi.profilePickTitle}</h1>
        <div className="course-profile-picker__grid">
          {me.profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`course-profile-picker__tile ad12-tappable ${me.profiles.length === 1 ? 'ad12-accent-active' : ''}`}
              onClick={() => setProfileId(p.id)}
            >
              <span className="course-profile-picker__avatar" aria-hidden="true">
                {presets.avatars.find((a) => a.id === p.avatarId)?.emoji ?? '❔'}
              </span>
              <span className="ad12-reading-text course-profile-picker__nickname">
                {presets.nicknames.find((n) => n.id === p.nicknameId)?.label ?? ''}
              </span>
            </button>
          ))}
          {me.profiles.length < 3 && (
            <div className="course-profile-picker__add" aria-hidden="true">
              <span className="course-profile-picker__add-mark">＋</span>
              <span className="ad12-ui-text">{courseUi.profileAddLabel}</span>
            </div>
          )}
        </div>
        <p className="ad12-ui-text course-profile-picker__account">{courseUi.profileAccountCaption}</p>
      </main>
    );
  }
  if (progress === 'loading') return <main className="ad12 course-loading"><p className="ad12-ui-text">{courseUi.loading}</p></main>;

  const licensed = isBeginnerCourseLicensed(me);
  const freeLessonIds = freeSampleLessonIds();

  function markListenDone(lessonId: string) {
    updateProgress((prev) => {
      const lesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      track('course_listen_done', { lessonId, courseId: BEGINNER_COURSE_ID });
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: { ...lesson, listenADone: true, lastStepAt: new Date().toISOString() } } };
    });
  }

  function markExerciseItemDone(lessonId: string, exerciseId: string) {
    updateProgress((prev) => {
      const prevLesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      track('course_item_done', { lessonId, exerciseId, courseId: BEGINNER_COURSE_ID });
      const nextLesson = {
        ...prevLesson,
        exercisesDone: Array.from(new Set([...prevLesson.exercisesDone, exerciseId])),
        lastStepAt: new Date().toISOString(),
      };
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: nextLesson } };
    });
  }

  function markAuditItemDone(lessonId: string, auditId: string) {
    updateProgress((prev) => {
      const prevLesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      track('course_audit_item_done', { lessonId, auditId, courseId: BEGINNER_COURSE_ID });
      const nextLesson = {
        ...prevLesson,
        exercisesDone: Array.from(new Set([...prevLesson.exercisesDone, auditId])),
        lastStepAt: new Date().toISOString(),
      };
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: nextLesson } };
    });
  }

  function addStar(lessonId: string) {
    updateProgress((prev) => {
      const lesson = prev.lessons[lessonId] ?? emptyLessonProgress();
      track('course_home_star', { lessonId, courseId: BEGINNER_COURSE_ID });
      return { ...prev, lessons: { ...prev.lessons, [lessonId]: { ...lesson, stars: lesson.stars + 1 } } };
    });
  }

  function earlyUnlock(lessonId: string) {
    if (progress === 'loading') return;
    if (progress.earlyUnlockedParts.includes(lessonId)) return;
    void persist({ ...progress, earlyUnlockedParts: [...progress.earlyUnlockedParts, lessonId] });
  }

  if (screen.kind === 'home') {
    return (
      <BeginnerCourseHome
        manifest={beginnerManifest}
        progress={progress}
        licensed={licensed}
        freeLessonIds={freeLessonIds}
        getLesson={getBeginnerLesson}
        onOpenLesson={(lessonId) => {
          track('course_lesson_start', { lessonId, courseId: BEGINNER_COURSE_ID });
          // Refund-tracking (Founder, 2 Oct 2026): only Lessons 2-7 ever count as "started" — the
          // free sample (Lesson 1) must not, and the backend itself re-checks both the lessonId
          // and the licence (handlers/courseLessonOpen.ts), so this is a defense-in-depth skip,
          // not the only thing standing between Lesson 1 and a recorded open.
          if (profileId && lessonId !== FREE_SAMPLE_LESSON_ID) void recordCourseLessonOpen(profileId, lessonId);
          setScreen({ kind: 'lesson', lessonId });
        }}
        onOpenEnding={() => setScreen({ kind: 'ending' })}
        onOpenParent={() => setScreen({ kind: 'parent', focusLessonId: null })}
      />
    );
  }

  if (screen.kind === 'parent') {
    return (
      <BeginnerParentScreen
        manifest={beginnerManifest}
        progress={progress}
        getLesson={getBeginnerLesson}
        focusLessonId={screen.focusLessonId}
        onEarlyUnlock={earlyUnlock}
        onBack={() => setScreen({ kind: 'home' })}
      />
    );
  }

  if (screen.kind === 'ending') {
    return (
      <EndingScreen
        lesson={beginnerEndingLesson}
        onDone={() => setScreen({ kind: 'home' })}
        onBack={() => setScreen({ kind: 'home' })}
      />
    );
  }

  // Not "unreachable in practice" any more: BeginnerCourseHome now also opens Lesson 1 for an
  // unlicensed family once PLAYGROUND_HIDDEN_BUILD_FLAG is on — isLessonAccessible is the same
  // per-lesson check it uses to decide that, so this stays the one real enforcement point for
  // lesson/listen/exercise/audit/home-task screens either way.
  if (!isLessonAccessible(me, screen.lessonId)) { setScreen({ kind: 'home' }); return null; }

  const lesson = getBeginnerLesson(screen.lessonId);
  if (!lesson) return null; // unreachable in practice: every transition below only ever targets a resolvable lessonId
  const lessonProgress = progress.lessons[screen.lessonId];

  if (screen.kind === 'lesson') {
    return (
      <BeginnerLessonScreen
        lesson={lesson}
        progress={lessonProgress}
        onOpenListen={() => setScreen({ kind: 'listen', lessonId: lesson.id })}
        onOpenExercise={() => setScreen({ kind: 'exercise', lessonId: lesson.id, index: 0 })}
        onOpenAudit={() => setScreen({ kind: 'audit', lessonId: lesson.id, index: 0 })}
        onOpenHome={() => setScreen({ kind: 'home-task', lessonId: lesson.id })}
        onBack={() => setScreen({ kind: 'home' })}
      />
    );
  }

  if (screen.kind === 'listen') {
    return (
      <ListenScreen
        lessonTitle={lesson.title}
        block={lesson.listen}
        onDone={() => { markListenDone(lesson.id); setScreen({ kind: 'lesson', lessonId: lesson.id }); }}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
      />
    );
  }

  if (screen.kind === 'exercise') {
    const exercise = lesson.exercises[screen.index];
    if (!exercise) { setScreen({ kind: 'lesson', lessonId: lesson.id }); return null; }
    return (
      <ExerciseScreen
        key={screen.index}
        exercise={exercise}
        position={{ index: screen.index, total: lesson.exercises.length }}
        onItemDone={(id) => markExerciseItemDone(lesson.id, id)}
        onNext={() => {
          const nextIndex = screen.index + 1;
          if (nextIndex >= lesson.exercises.length) setScreen({ kind: 'lesson', lessonId: lesson.id });
          else setScreen({ kind: 'exercise', lessonId: lesson.id, index: nextIndex });
        }}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
      />
    );
  }

  if (screen.kind === 'audit') {
    const item = lesson.audit[screen.index];
    if (!item) { setScreen({ kind: 'lesson', lessonId: lesson.id }); return null; }
    return (
      <AuditScreen
        key={screen.index}
        lessonId={lesson.id}
        item={item}
        position={{ index: screen.index, total: lesson.audit.length }}
        onItemDone={(id) => markAuditItemDone(lesson.id, id)}
        onNext={() => {
          const nextIndex = screen.index + 1;
          if (nextIndex >= lesson.audit.length) setScreen({ kind: 'lesson', lessonId: lesson.id });
          else setScreen({ kind: 'audit', lessonId: lesson.id, index: nextIndex });
        }}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
      />
    );
  }

  if (screen.kind === 'home-task') {
    return (
      <HomeTaskScreen
        lessonId={lesson.id}
        home={lesson.home}
        stars={lessonProgress?.stars ?? 0}
        onStar={() => addStar(lesson.id)}
        onBack={() => setScreen({ kind: 'lesson', lessonId: lesson.id })}
        onSkip={() => setScreen({ kind: 'home' })}
      />
    );
  }

  return null;
}
