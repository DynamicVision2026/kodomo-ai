/**
 * WO-C1 §3 screen 4 — Exercise. One item at a time: scene -> q0 -> the grown-up's (ambiguous)
 * answer -> the child picks a follow-up question. Options render with equal visual weight (no
 * hint of which is `best` — `MoveCard`'s own F3 "equal choices stay visually equal" discipline is
 * exactly this exercise's own design intent, so it's reused as-is for the option buttons rather
 * than a new choice component). Picking a non-`best` option shows its reply/feedback and lets the
 * child try again; picking `best` shows its reply/feedback and marks the item done — matching
 * `exercisesDone`'s own "done once the child has seen the best option's feedback" semantics
 * (shared/courseProgressMerge.ts).
 */
import { useState } from 'react';
import { MoveCard } from '../../ad12/MoveCard';
import { Plane } from '../../ad12/Plane';
import { DialoguePlane } from '../DialoguePlane';
import { Ruby } from '../../engine/ruby';
import { courseUi } from '../content/courseManifest';
import type { CourseExercise } from '../content/types';

export interface ExerciseScreenProps {
  exercise: CourseExercise;
  /** 1-based position / total, for the screen's own progress header (courseUi.exerciseProgressLabel
   *  plus "index/total") — never used to gate anything, purely orientation. */
  position: { index: number; total: number };
  /** Fires once, the first time this exercise's `best` option is picked. Safe to call again on a
   *  replay (`exercisesDone` unions ids, so a repeat is a no-op server-side). */
  onItemDone: (exerciseId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

type Step = { kind: 'choosing' } | { kind: 'answered'; optionId: string };

export function ExerciseScreen({ exercise, position, onItemDone, onNext, onBack }: ExerciseScreenProps) {
  const [step, setStep] = useState<Step>({ kind: 'choosing' });
  const [showHint, setShowHint] = useState(false);
  const exerciseStep = exercise.steps[0];

  function choose(optionId: string) {
    setStep({ kind: 'answered', optionId });
    const option = exerciseStep?.options.find((o) => o.id === optionId);
    if (option?.role === 'best') onItemDone(exercise.id);
  }

  const chosen = step.kind === 'answered' ? exerciseStep?.options.find((o) => o.id === step.optionId) : undefined;
  const solved = chosen?.role === 'best';

  return (
    <main className="ad12 course-screen course-exercise">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <p className="ad12-ui-text">{courseUi.exerciseProgressLabel} {position.index + 1}/{position.total}</p>
      <Plane className="course-exercise__scene">
        <p className="ad12-ui-text"><Ruby text={exercise.scene.text} /></p>
      </Plane>
      <DialoguePlane speaker={exercise.q0.speaker} text={exercise.q0.text} />
      {exerciseStep && <DialoguePlane speaker={exerciseStep.answer.speaker} text={exerciseStep.answer.text} />}

      {step.kind === 'choosing' && exerciseStep && (
        <>
          <div className="course-exercise__options">
            {exerciseStep.options.map((option) => (
              <MoveCard key={option.id} text={option.text} onCommit={() => choose(option.id)} />
            ))}
          </div>
          {!showHint ? (
            <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setShowHint(true)}>
              {courseUi.exerciseHintLabel}
            </button>
          ) : (
            <Plane className="course-exercise__hint">
              <p className="ad12-ui-text">{exerciseStep.hint.h1}</p>
              <p className="ad12-ui-text course-exercise__hint-highlight">{exerciseStep.hint.h2Highlight}</p>
            </Plane>
          )}
        </>
      )}

      {step.kind === 'answered' && chosen && (
        <>
          <DialoguePlane speaker={chosen.reply.speaker} text={chosen.reply.text} />
          <Plane className="course-exercise__feedback">
            <p className="ad12-ui-text"><Ruby text={chosen.feedback} /></p>
          </Plane>
          {solved ? (
            <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onNext}>
              {position.index + 1 >= position.total ? courseUi.backToLessonLabel : courseUi.exerciseNextLabel}
            </button>
          ) : (
            <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={() => setStep({ kind: 'choosing' })}>
              {courseUi.exerciseRetryLabel}
            </button>
          )}
        </>
      )}
    </main>
  );
}
