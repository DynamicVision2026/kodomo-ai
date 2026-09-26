/** WO-C2 §1/§3.2 (replaces WO-C1 §3 screen 2) — Lesson hub. The 8-step flow's own home: きくA・
 *  えらぶA・きくB・えらぶB・つくる・つたえる・しらべる, each opening only once the previous step
 *  is done ("Each step opens when the previous is done" — WO-C1's "replaying always allowed,
 *  never lowers progress" still holds: once a step is unlocked it stays reachable even after later
 *  steps are also done). A locked step stays tappable and shows a diegetic note instead of
 *  entering, same UX language CourseHome already uses for a locked flower. */
import { useState } from 'react';
import { Icon } from '../Icon';
import { Plane } from '../../ad12/Plane';
import { courseUi } from '../content/courseManifest';
import type { CourseLesson } from '../content/types';
import { computeLessonPercent, computeStepUnlocks, emptyLessonProgress, type CourseLessonProgress } from '../progress';

export interface LessonScreenProps {
  lesson: CourseLesson;
  progress: CourseLessonProgress | undefined;
  onOpenListen: (blockIndex: number) => void;
  onOpenExercise: (blockIndex: number) => void;
  onOpenMake: () => void;
  onOpenTeachBack: () => void;
  onOpenFamily: () => void;
  onBack: () => void;
}

export function LessonScreen({
  lesson, progress, onOpenListen, onOpenExercise, onOpenMake, onOpenTeachBack, onOpenFamily, onBack,
}: LessonScreenProps) {
  const [note, setNote] = useState<string | null>(null);
  const p = progress ?? emptyLessonProgress();
  const percent = computeLessonPercent(lesson, p);
  const unlocks = computeStepUnlocks(lesson, p);
  const blockA = lesson.listen[0];
  const blockB = lesson.listen[1];
  const exerciseADoneCount = (blockA?.thenExercises ?? []).filter((id) => p.exercisesDone.includes(id)).length;
  const exerciseBDoneCount = (blockB?.thenExercises ?? []).filter((id) => p.exercisesDone.includes(id)).length;
  const makeAllDone = lesson.make.every((_, i) => (i === 0 ? p.makeADone : p.makeBDone));

  function guarded(unlocked: boolean, onSelect: () => void) {
    return unlocked ? onSelect : () => setNote(courseUi.stepLockedNote);
  }

  return (
    <main className="ad12 course-screen course-lesson">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">{lesson.title}</h1>
      <div className="course-lesson__tools">
        {lesson.tools.map((tool) => <Icon key={tool} tool={tool} size={48} />)}
      </div>
      <p className="ad12-ui-text">{percent}%</p>
      {note && <Plane className="course-lesson__note"><p className="ad12-ui-text">{note}</p></Plane>}

      <div className="course-lesson__steps">
        {blockA && (
          <LessonStep label={courseUi.lessonStepListenA} done={p.listenADone} locked={!unlocks.listenA} onSelect={guarded(unlocks.listenA, () => onOpenListen(0))} />
        )}
        {blockA && (
          <LessonStep
            label={`${courseUi.lessonStepExerciseA}（${exerciseADoneCount}/${blockA.thenExercises.length}）`}
            done={exerciseADoneCount >= blockA.thenExercises.length}
            locked={!unlocks.exerciseA}
            onSelect={guarded(unlocks.exerciseA, () => onOpenExercise(0))}
          />
        )}
        {blockB && (
          <LessonStep label={courseUi.lessonStepListenB} done={p.listenBDone} locked={!unlocks.listenB} onSelect={guarded(unlocks.listenB, () => onOpenListen(1))} />
        )}
        {blockB && (
          <LessonStep
            label={`${courseUi.lessonStepExerciseB}（${exerciseBDoneCount}/${blockB.thenExercises.length}）`}
            done={exerciseBDoneCount >= blockB.thenExercises.length}
            locked={!unlocks.exerciseB}
            onSelect={guarded(unlocks.exerciseB, () => onOpenExercise(1))}
          />
        )}
        <LessonStep label={courseUi.lessonStepMake} done={makeAllDone} locked={!unlocks.make} onSelect={guarded(unlocks.make, onOpenMake)} />
        <LessonStep label={courseUi.lessonStepTeachBack} done={p.teachBackDone} locked={!unlocks.teachBack} onSelect={guarded(unlocks.teachBack, onOpenTeachBack)} />
        <LessonStep label={courseUi.familyLinkLabel} done={p.stars > 0} locked={!unlocks.family} onSelect={guarded(unlocks.family, onOpenFamily)} />
      </div>
    </main>
  );
}

function LessonStep({ label, done, locked, onSelect }: { label: string; done: boolean; locked: boolean; onSelect: () => void }) {
  return (
    <Plane className={`course-lesson__step ${done ? 'course-lesson__step--done' : ''} ${locked ? 'course-lesson__step--locked' : ''}`}>
      <button type="button" className="ad12-ink-button ad12-tappable course-lesson__step-button" onClick={onSelect}>
        <span className="ad12-reading-text">{label}</span>
        {done && <span className="ad12-ui-text course-lesson__step-check">✓</span>}
      </button>
    </Plane>
  );
}
