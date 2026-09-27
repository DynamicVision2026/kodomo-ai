/**
 * WO-C5 §3 — the beginner course's own lesson hub: きく→れんしゅう→チェック→おうちで, mirroring
 * `LessonScreen.tsx`'s "locked step stays tappable, shows a diegetic note" idiom exactly, just
 * against the beginner lesson's own 4-step shape (one listen block, no make/teachBack/family).
 */
import { useState } from 'react';
import { Icon } from '../Icon';
import { Plane } from '../../ad12/Plane';
import { courseUi } from '../content/courseManifest';
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

  function guarded(unlocked: boolean, onSelect: () => void) {
    return unlocked ? onSelect : () => setNote(courseUi.stepLockedNote);
  }

  return (
    <main className="ad12 course-screen course-lesson">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">{lesson.title}</h1>
      <div className="course-lesson__tools">
        <Icon tool={lesson.tool} size={48} />
      </div>
      <p className="ad12-ui-text">{percent}%</p>
      {note && <Plane className="course-lesson__note"><p className="ad12-ui-text">{note}</p></Plane>}

      <div className="course-lesson__steps">
        <BeginnerLessonStep label={courseUi.lessonStepListenSingle} done={p.listenADone} locked={!unlocks.listen} onSelect={guarded(unlocks.listen, onOpenListen)} />
        <BeginnerLessonStep
          label={`${courseUi.lessonStepExerciseSingle}（${exerciseDoneCount}/${lesson.exercises.length}）`}
          done={exerciseDoneCount >= lesson.exercises.length}
          locked={!unlocks.exercise}
          onSelect={guarded(unlocks.exercise, onOpenExercise)}
        />
        <BeginnerLessonStep
          label={`${courseUi.lessonStepAudit}（${auditDoneCount}/${lesson.audit.length}）`}
          done={auditDoneCount >= lesson.audit.length}
          locked={!unlocks.audit}
          onSelect={guarded(unlocks.audit, onOpenAudit)}
        />
        <BeginnerLessonStep label={courseUi.lessonStepHome} done={p.stars > 0} locked={!unlocks.home} onSelect={guarded(unlocks.home, onOpenHome)} />
      </div>
    </main>
  );
}

function BeginnerLessonStep({ label, done, locked, onSelect }: { label: string; done: boolean; locked: boolean; onSelect: () => void }) {
  return (
    <Plane className={`course-lesson__step ${done ? 'course-lesson__step--done' : ''} ${locked ? 'course-lesson__step--locked' : ''}`}>
      <button type="button" className="ad12-ink-button ad12-tappable course-lesson__step-button" onClick={onSelect}>
        <span className="ad12-reading-text">{label}</span>
        {done && <span className="ad12-ui-text course-lesson__step-check">✓</span>}
      </button>
    </Plane>
  );
}
