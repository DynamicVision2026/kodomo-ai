/**
 * WO-C5 §3 — the beginner course's own lesson hub: きく→れんしゅう→チェック→おうちで, mirroring
 * `LessonScreen.tsx`'s "locked step stays tappable, shows a diegetic note" idiom exactly, just
 * against the beginner lesson's own 4-step shape (one listen block, no make/teachBack/family).
 */
import { useState } from 'react';
import { Icon } from '../Icon';
import { Plane } from '../../ad12/Plane';
import { courseUi } from '../content/courseManifest';
import { unlock as unlockCourseAudio } from '../courseAudioPlayer';
import type { CourseBeginnerLesson } from '../content/types';
import { computeBeginnerLessonPercent, computeBeginnerStepUnlocks, emptyLessonProgress, type CourseLessonProgress } from '../progress';

export interface BeginnerLessonScreenProps {
  lesson: CourseBeginnerLesson;
  progress: CourseLessonProgress | undefined;
  onOpenListen: () => void;
  onOpenExercise: () => void;
  onOpenAudit: () => void;
  onOpenHome: () => void;
  onBack: () => void;
}

export function BeginnerLessonScreen({
  lesson, progress, onOpenListen, onOpenExercise, onOpenAudit, onOpenHome, onBack,
}: BeginnerLessonScreenProps) {
  const [note, setNote] = useState<string | null>(null);
  const p = progress ?? emptyLessonProgress();
  const percent = computeBeginnerLessonPercent(lesson, p);
  const unlocks = computeBeginnerStepUnlocks(lesson, p);
  const exerciseDoneCount = lesson.exercises.filter((e) => p.exercisesDone.includes(e.id)).length;
  const auditDoneCount = lesson.audit.filter((a) => p.exercisesDone.includes(a.id)).length;

  // Founder iPad Safari fix (28 Sep 2026): every step tap is a real user gesture — the one place
  // every entry into an audio-driven screen already passes through — so this is where the shared
  // course-audio element gets its one-time activation (see courseAudioPlayer.ts's own doc
  // comment). A no-op after the first call.
  function guarded(unlocked: boolean, onSelect: () => void) {
    return unlocked ? () => { unlockCourseAudio(); onSelect(); } : () => setNote(courseUi.stepLockedNote);
  }

  // WO-C6 Push B §3: the current lesson's own next unopened step gets the one yellow ring — the
  // exact same "which step is next" logic BeginnerCourseHome.tsx's own つぎは button uses, kept in
  // lockstep with the real unlock state (never a second, separate notion of "current").
  const exerciseDone = exerciseDoneCount >= lesson.exercises.length;
  const auditDone = auditDoneCount >= lesson.audit.length;
  const nextStep = !p.listenADone ? 'listen' : !exerciseDone ? 'exercise' : !auditDone ? 'audit' : 'home';

  return (
    <main className="ad12 course-screen course-lesson">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <Plane className="course-lesson__tool">
        <Icon tool={lesson.tool} size={96} className="course-lesson__tool-icon" />
        <h1 className="ad12-reading-text course-lesson__tool-title">{lesson.title}</h1>
      </Plane>
      {note && <Plane className="course-lesson__note"><p className="ad12-ui-text">{note}</p></Plane>}

      <div className="course-lesson__steps">
        <BeginnerLessonStep
          iconId="i-ear" label={courseUi.lessonStepListenSingle} subtitle={courseUi.lessonStepListenSubtitle}
          done={p.listenADone} next={nextStep === 'listen'} locked={!unlocks.listen}
          onSelect={guarded(unlocks.listen, onOpenListen)}
        />
        <BeginnerLessonStep
          iconId="i-hand" label={courseUi.lessonStepExerciseSingle} subtitle={courseUi.lessonStepExerciseSubtitle}
          done={exerciseDone} next={nextStep === 'exercise'} locked={!unlocks.exercise}
          dots={{ done: exerciseDoneCount, total: lesson.exercises.length }}
          onSelect={guarded(unlocks.exercise, onOpenExercise)}
        />
        <BeginnerLessonStep
          iconId="i-glass" label={courseUi.lessonStepAudit} subtitle={courseUi.lessonStepAuditSubtitle}
          done={auditDone} next={nextStep === 'audit'} locked={!unlocks.audit}
          onSelect={guarded(unlocks.audit, onOpenAudit)}
        />
        <BeginnerLessonStep
          iconId="i-house" label={courseUi.lessonStepHome} subtitle={courseUi.lessonStepHomeSubtitle}
          done={p.stars > 0} next={nextStep === 'home'} locked={!unlocks.home}
          onSelect={guarded(unlocks.home, onOpenHome)}
        />
      </div>
      <p className="ad12-ui-text course-lesson__percent">{percent}%</p>
    </main>
  );
}

function BeginnerLessonStep({ iconId, label, subtitle, done, next, locked, dots, onSelect }: {
  iconId: string; label: string; subtitle: string; done: boolean; next: boolean; locked: boolean;
  dots?: { done: number; total: number }; onSelect: () => void;
}) {
  return (
    <Plane className={`course-lesson__step ${done ? 'course-lesson__step--done' : ''} ${locked ? 'course-lesson__step--locked' : ''} ${next ? 'ad12-accent-active' : ''}`}>
      <button type="button" className="ad12-ink-button ad12-tappable course-lesson__step-button" onClick={onSelect}>
        <span className={`course-lesson__step-badge ${done ? 'course-lesson__step-badge--done' : ''} ${next ? 'course-lesson__step-badge--next' : ''}`}>
          <svg width="28" height="28"><use href={`#${done ? 'i-check' : iconId}`} /></svg>
        </span>
        <span className="course-lesson__step-text">
          <span className="ad12-reading-text course-lesson__step-label">{label}</span>
          <span className="ad12-ui-text course-lesson__step-subtitle">{subtitle}</span>
        </span>
        {dots && (
          <span className="course-exercise__dots" aria-hidden="true">
            {Array.from({ length: dots.total }, (_, i) => (
              <span key={i} className={`course-exercise__dot ${i < dots.done ? 'course-exercise__dot--done' : ''}`} />
            ))}
          </span>
        )}
      </button>
    </Plane>
  );
}
