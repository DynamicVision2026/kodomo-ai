/**
 * WO-C2 §3.2 (rewrites WO-C1 §3 screen 4) — Practice（れんしゅう）. One item at a time: scene ->
 * q0 -> the grown-up's (ambiguous) answer -> the child picks a follow-up question, in
 * `steps[0].displayOrder` order. Options render with equal visual weight (no hint of which is
 * `best` — `MoveCard`'s own F3 "equal choices stay visually equal" discipline is exactly this
 * exercise's own design intent). Picking the `best` option marks the item done and shows a
 * used-tool badge with a large 「つぎへ」 and a small 「ほかのカードも見てみる」 exploration link;
 * picking any other option shows its reply/feedback and a 「もう一回えらぶ」 retry, escalating help
 * after 1 miss (`hint.h1`, auto-shown) and after 2 misses (`hint.h2Highlight` highlighted inside
 * the answer + every already-tried card disabled — 「のこりは一まい」). `exercisesDone`'s own "done
 * once the child has seen the best option's feedback" semantics (shared/courseProgressMerge.ts)
 * are unchanged from WO-C1.
 */
import { useState } from 'react';
import { MoveCard } from '../../ad12/MoveCard';
import { Plane } from '../../ad12/Plane';
import { DialoguePlane } from '../DialoguePlane';
import { Ruby } from '../../engine/ruby';
import { courseUi } from '../content/courseManifest';
import type { CourseExercise, CourseExerciseOption } from '../content/types';

export interface ExerciseScreenProps {
  exercise: CourseExercise;
  /** 0-based position / total within the current きく block's `thenExercises` — orientation only,
   *  never used to gate anything. */
  position: { index: number; total: number };
  /** Fires once, the first time this exercise's `best` option is picked. Safe to call again on a
   *  replay (`exercisesDone` unions ids, so a repeat is a no-op server-side). */
  onItemDone: (exerciseId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

type Phase =
  | { kind: 'picking' }
  | { kind: 'miss'; optionId: string }
  | { kind: 'solved'; optionId: string; exploring: boolean; exploreOptionId: string | null }
  | { kind: 'complete' };

/** Renders `text` with the first exact occurrence of `needle` wrapped in a highlight span — used
 *  for hint.h2Highlight's own "highlighted inside the answer" behaviour after the 2nd miss. Falls
 *  back to the plain text if `needle` isn't found (defensive; the real content always has it as an
 *  exact substring of the answer). */
function highlightSubstring(text: string, needle: string) {
  if (!needle) return <Ruby text={text} />;
  const at = text.indexOf(needle);
  if (at === -1) return <Ruby text={text} />;
  const before = text.slice(0, at);
  const after = text.slice(at + needle.length);
  return (
    <>
      {before && <Ruby text={before} />}
      <mark className="course-exercise__answer-highlight"><Ruby text={needle} /></mark>
      {after && <Ruby text={after} />}
    </>
  );
}

export function ExerciseScreen({ exercise, position, onItemDone, onNext, onBack }: ExerciseScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'picking' });
  const [missCount, setMissCount] = useState(0);
  const [triedIds, setTriedIds] = useState<string[]>([]);
  const [hintShown, setHintShown] = useState(false);
  const exerciseStep = exercise.steps[0];
  const options = exerciseStep?.options ?? [];
  const displayOrder = exerciseStep?.displayOrder ?? options.map((o) => o.id);
  const orderedOptions = displayOrder
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is CourseExerciseOption => !!o);

  const isLastItem = position.index + 1 >= position.total;
  const showH1 = hintShown || missCount >= 1;
  const showH2 = missCount >= 2;

  function choose(option: CourseExerciseOption) {
    if (option.role === 'best') {
      setPhase({ kind: 'solved', optionId: option.id, exploring: false, exploreOptionId: null });
      onItemDone(exercise.id);
    } else {
      setMissCount((c) => c + 1);
      setTriedIds((ids) => (ids.includes(option.id) ? ids : [...ids, option.id]));
      setPhase({ kind: 'miss', optionId: option.id });
    }
  }

  function handleNext() {
    if (isLastItem) setPhase({ kind: 'complete' });
    else onNext();
  }

  if (phase.kind === 'complete') {
    return (
      <main className="ad12 course-screen course-exercise course-exercise--complete">
        <p className="ad12-reading-text">{courseUi.practice.doneLabel}</p>
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onNext}>
          {courseUi.practice.nextLabel}
        </button>
      </main>
    );
  }

  const chosen = phase.kind === 'miss' || phase.kind === 'solved'
    ? orderedOptions.find((o) => o.id === phase.optionId)
    : undefined;

  return (
    <main className="ad12 course-screen course-exercise">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <div className="course-exercise__dots" aria-hidden="true">
        {Array.from({ length: position.total }, (_, i) => (
          <span
            key={i}
            className={`course-exercise__dot ${i < position.index || (i === position.index && phase.kind === 'solved') ? 'course-exercise__dot--done' : ''}`}
          />
        ))}
      </div>
      <p className="ad12-ui-text">{courseUi.exerciseProgressLabel} {position.index + 1}/{position.total}</p>
      <Plane className="course-exercise__scene">
        <p className="ad12-ui-text"><Ruby text={exercise.scene.text} /></p>
      </Plane>
      <DialoguePlane speaker={exercise.q0.speaker} text={exercise.q0.text} />
      {exerciseStep && (
        <Plane className="course-exercise__answer">
          <p className="ad12-ui-text course-dialogue__speaker">{exerciseStep.answer.speaker}</p>
          <p className="ad12-reading-text">
            {showH2 ? highlightSubstring(exerciseStep.answer.text, exerciseStep.hint.h2Highlight) : <Ruby text={exerciseStep.answer.text} />}
          </p>
        </Plane>
      )}

      {phase.kind === 'picking' && exerciseStep && (
        <>
          <p className="ad12-ui-text">{courseUi.practice.nextPrompt}</p>
          <div className="course-exercise__options">
            {orderedOptions.map((option) => {
              const tried = triedIds.includes(option.id);
              const blocked = showH2 && tried;
              return (
                <MoveCard
                  key={option.id}
                  text={option.text}
                  onCommit={() => choose(option)}
                  blocked={blocked}
                  badge={tried ? courseUi.practice.triedLabel : undefined}
                />
              );
            })}
          </div>
          {showH2 && <p className="ad12-ui-text course-exercise__only-one">{courseUi.practice.onlyOneLeftPrompt}</p>}
          {!hintShown && !showH1 && (
            <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setHintShown(true)}>
              {courseUi.practice.hintLabel}
            </button>
          )}
          {showH1 && (
            <Plane className="course-exercise__hint">
              <p className="ad12-ui-text">{exerciseStep.hint.h1}</p>
            </Plane>
          )}
        </>
      )}

      {phase.kind === 'miss' && chosen && (
        <>
          <DialoguePlane speaker={chosen.reply.speaker} text={chosen.reply.text} />
          <DialoguePlane speaker={courseUi.practice.feedbackSpeaker} text={chosen.feedback} />
          <p className="ad12-ui-text">{courseUi.practice.retryPrompt}</p>
          <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={() => setPhase({ kind: 'picking' })}>
            {courseUi.practice.retryLabel}
          </button>
        </>
      )}

      {phase.kind === 'solved' && chosen && (
        <>
          <DialoguePlane speaker={chosen.reply.speaker} text={chosen.reply.text} />
          <DialoguePlane speaker={courseUi.practice.feedbackSpeaker} text={chosen.feedback} />
          {chosen.tool && (
            <Plane className="course-exercise__badge">
              <p className="ad12-ui-text">
                {courseUi.practice.badgeToolUsed}：「{courseUi.toolLabels[chosen.tool].label}」
              </p>
            </Plane>
          )}

          {phase.exploring && (
            <Plane className="course-exercise__explore">
              {phase.exploreOptionId ? (
                (() => {
                  const other = orderedOptions.find((o) => o.id === phase.exploreOptionId);
                  if (!other) return null;
                  return (
                    <>
                      <DialoguePlane speaker={other.reply.speaker} text={other.reply.text} />
                      <DialoguePlane speaker={courseUi.practice.feedbackSpeaker} text={other.feedback} />
                      <button
                        type="button"
                        className="ad12-ink-button ad12-tappable"
                        onClick={() => setPhase({ ...phase, exploreOptionId: null })}
                      >
                        {courseUi.practice.closeLabel}
                      </button>
                    </>
                  );
                })()
              ) : (
                <div className="course-exercise__options">
                  {orderedOptions.filter((o) => o.id !== chosen.id).map((option) => (
                    <MoveCard key={option.id} text={option.text} onCommit={() => setPhase({ ...phase, exploreOptionId: option.id })} />
                  ))}
                </div>
              )}
            </Plane>
          )}

          <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={handleNext}>
            {courseUi.practice.nextLabel}
          </button>
          {!phase.exploring && orderedOptions.length > 1 && (
            <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setPhase({ ...phase, exploring: true })}>
              {courseUi.practice.seeOtherCardsLabel}
            </button>
          )}
        </>
      )}
    </main>
  );
}
