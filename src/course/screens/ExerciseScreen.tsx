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
import { hatenaQuestionUrl } from '../characterArt';
import { useVoiceQueue } from '../useVoiceQueue';
import { useAudioError } from '../useAudioError';
import { Ruby } from '../../engine/ruby';
import { courseUi } from '../content/courseManifest';
import { exerciseQ0AudioPath, exerciseAnswerAudioPath, exerciseOptionAudioPath, SHARED_AUDIO } from '../audioPaths';
import type { CourseExercise, CourseExerciseOption } from '../content/types';

/** 'c01-e01' -> 'c01' */
function lessonIdOf(exerciseId: string): string {
  return exerciseId.split('-e')[0]!;
}

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
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'picking' });
  const [missCount, setMissCount] = useState(0);
  const [triedIds, setTriedIds] = useState<string[]>([]);
  const [hintShown, setHintShown] = useState(false);
  /** WO-C5 §2 b07 chains: the intended card's own text at each completed earlier step, shown as a
   *  compact trail while the child works through the remaining steps. */
  const [chainTrail, setChainTrail] = useState<string[]>([]);
  // WO-C5 §2: chains are b07's own tool-G exercises specifically ("2-3 step chains"), never
  // inferred from `steps.length` alone — c00-demo-e02 (pre-existing stage2 content, tool B) also
  // happens to declare 2 steps for its own, unrelated reason, and ExerciseScreen has always only
  // ever read `steps[0]` for it (this screen's own original header comment: "in steps[0].
  // displayOrder order"); gating on `tool === 'G'` too keeps that exact pre-existing behavior
  // untouched for every non-chain exercise, whatever its own `steps` array happens to contain.
  const isChain = exercise.tool === 'G' && exercise.steps.length > 1;
  const exerciseStep = exercise.steps[stepIndex];
  const options = exerciseStep?.options ?? [];
  const displayOrder = exerciseStep?.displayOrder ?? options.map((o) => o.id);
  const orderedOptions = displayOrder
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is CourseExerciseOption => !!o);

  const isLastItem = position.index + 1 >= position.total;
  const isLastStep = stepIndex + 1 >= exercise.steps.length;
  const showH1 = hintShown || missCount >= 1;
  const showH2 = missCount >= 2;

  /** WO-C5 §2: `sameTool` also counts as success (the child used today's own tool, just on a
   *  different, still-valid angle) — c01-c06 never author this role, so this only ever widens
   *  behaviour for the beginner course's own content. */
  function isSuccess(option: CourseExerciseOption): boolean {
    return option.role === 'best' || option.role === 'sameTool';
  }

  function choose(option: CourseExerciseOption) {
    if (isSuccess(option)) {
      if (isChain && !isLastStep) {
        // WO-C5 §2: "don't play it twice" — the reply/feedback beat below plays this option's own
        // audio once; the NEXT step's own `answer` (identical text) is then shown without its own
        // voice cue, advancing only once this beat is acknowledged (`chainNext`).
        setPhase({ kind: 'solved', optionId: option.id, exploring: false, exploreOptionId: null });
      } else {
        setPhase({ kind: 'solved', optionId: option.id, exploring: false, exploreOptionId: null });
        onItemDone(exercise.id);
      }
    } else {
      setMissCount((c) => c + 1);
      setTriedIds((ids) => (ids.includes(option.id) ? ids : [...ids, option.id]));
      setPhase({ kind: 'miss', optionId: option.id });
    }
  }

  function chainNext(caughtWord: string) {
    setChainTrail((t) => [...t, caughtWord]);
    setStepIndex((i) => i + 1);
    setPhase({ kind: 'picking' });
    setMissCount(0);
    setTriedIds([]);
    setHintShown(false);
  }

  function handleNext() {
    if (isLastItem) setPhase({ kind: 'complete' });
    else onNext();
  }

  const chosen = phase.kind === 'miss' || phase.kind === 'solved'
    ? orderedOptions.find((o) => o.id === phase.optionId)
    : undefined;
  const lessonId = lessonIdOf(exercise.id);

  // Founder iPad Safari fix (28 Sep 2026): every VoiceCue this screen used to mount in parallel
  // (up to 3-4 per phase) now queues through one shared, already-unlocked <audio> element instead
  // — see courseAudioPlayer.ts's own doc comment for why simultaneous fresh <audio> elements were
  // the actual bug. Two independent queues, matching the two independent "narrates once" scopes
  // the original per-VoiceCue `[src]` effects had: q0/answer play once per exercise mount
  // (unaffected by later phase/retry churn), everything else replays each time its own phase
  // moment is freshly entered.
  const introSrcs = [exerciseQ0AudioPath(lessonId, exercise.id), stepIndex === 0 ? exerciseAnswerAudioPath(lessonId, exercise.id) : undefined];
  useVoiceQueue(introSrcs, `intro-${exercise.id}`);

  let phaseVoiceSrcs: (string | undefined)[] = [];
  let phaseVoiceKey = `none-${exercise.id}-${stepIndex}`;
  if (phase.kind === 'picking') {
    phaseVoiceSrcs = [SHARED_AUDIO.practiceNextPrompt];
    phaseVoiceKey = `picking-${exercise.id}-${stepIndex}-${missCount}`;
  } else if (phase.kind === 'miss' && chosen) {
    phaseVoiceSrcs = [
      (chosen.kind === 'question' || chosen.kind === 'stop')
        ? exerciseOptionAudioPath(lessonId, exercise.id, chosen.id, 'ask', stepIndex) : undefined,
      exerciseOptionAudioPath(lessonId, exercise.id, chosen.id, 'reply', stepIndex),
      exerciseOptionAudioPath(lessonId, exercise.id, chosen.id, 'feedback', stepIndex),
      SHARED_AUDIO.practiceRetryPrompt,
    ];
    phaseVoiceKey = `miss-${exercise.id}-${stepIndex}-${chosen.id}-${missCount}`;
  } else if (phase.kind === 'solved' && chosen) {
    const other = phase.exploring && phase.exploreOptionId
      ? orderedOptions.find((o) => o.id === phase.exploreOptionId)
      : undefined;
    if (other) {
      phaseVoiceSrcs = [
        (other.kind === 'question' || other.kind === 'stop')
          ? exerciseOptionAudioPath(lessonId, exercise.id, other.id, 'ask', stepIndex) : undefined,
        exerciseOptionAudioPath(lessonId, exercise.id, other.id, 'reply', stepIndex),
        exerciseOptionAudioPath(lessonId, exercise.id, other.id, 'feedback', stepIndex),
      ];
      phaseVoiceKey = `explore-${exercise.id}-${stepIndex}-${chosen.id}-${other.id}`;
    } else {
      phaseVoiceSrcs = [
        (chosen.kind === 'question' || chosen.kind === 'stop')
          ? exerciseOptionAudioPath(lessonId, exercise.id, chosen.id, 'ask', stepIndex) : undefined,
        exerciseOptionAudioPath(lessonId, exercise.id, chosen.id, 'reply', stepIndex),
        exerciseOptionAudioPath(lessonId, exercise.id, chosen.id, 'feedback', stepIndex),
      ];
      phaseVoiceKey = `solved-${exercise.id}-${stepIndex}-${chosen.id}`;
    }
  }
  useVoiceQueue(phaseVoiceSrcs, phaseVoiceKey);
  const { failedSrc, retry } = useAudioError();
  // WO-C6 A2: a quiet もういちど shows next to whichever line's own clip just failed — this
  // screen has no single "current line" the way ListenScreen's transcript does, so it's anchored
  // to the intro (scene/q0/answer) plane vs. the current phase's own dialogue/feedback plane.
  const introAudioFailed = failedSrc !== null && introSrcs.includes(failedSrc);
  const phaseAudioFailed = failedSrc !== null && phaseVoiceSrcs.includes(failedSrc);

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

  return (
    <main className="ad12 course-screen course-exercise">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <div className="course-exercise__dots" aria-hidden="true">
        {Array.from({ length: position.total }, (_, i) => (
          <span
            key={i}
            className={`course-exercise__dot ${i < position.index || (i === position.index && phase.kind === 'solved' && (!isChain || isLastStep)) ? 'course-exercise__dot--done' : ''}`}
          />
        ))}
      </div>
      <p className="ad12-ui-text">{courseUi.exerciseProgressLabel} {position.index + 1}/{position.total}</p>
      {isChain && (
        <>
          <p className="ad12-ui-text course-exercise__chain-step">
            {courseUi.chainStepLabel.replace('{n}', String(stepIndex + 1)).replace('{total}', String(exercise.steps.length))}
          </p>
          {chainTrail.length > 0 && (
            <div className="course-exercise__chain-trail" aria-hidden="true">
              {chainTrail.map((word, i) => <span key={i} className="course-exercise__chain-trail-chip ad12-ui-text">「{word}」</span>)}
            </div>
          )}
        </>
      )}
      <Plane className="course-exercise__scene">
        <p className="ad12-ui-text"><Ruby text={exercise.scene.text} /></p>
      </Plane>
      <DialoguePlane speaker={exercise.q0.speaker} text={exercise.q0.text} />
      {exerciseStep && (
        <Plane className="course-exercise__answer">
          <p className="ad12-ui-text course-dialogue__speaker">{exerciseStep.answer.speaker}</p>
          <p className="ad12-reading-text">
            {showH2 ? highlightSubstring(exerciseStep.answer.text, exerciseStep.hint.h2Highlight) : <Ruby text={exerciseStep.answer.text} />}
            {introAudioFailed && (
              <button type="button" className="ad12-ink-button ad12-tappable course-screen__audio-retry" onClick={retry}>{courseUi.audioRetryLabel}</button>
            )}
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
            <button type="button" className="ad12-ink-button ad12-tappable course-exercise__hint-button" onClick={() => setHintShown(true)}>
              <img src={hatenaQuestionUrl} alt="" className="course-dialogue__speaker-icon" aria-hidden="true" />
              {courseUi.practice.hintLabel}
            </button>
          )}
          {showH1 && (
            <Plane className="course-exercise__hint">
              <p className="ad12-ui-text">
                <img src={hatenaQuestionUrl} alt="" className="course-dialogue__speaker-icon" aria-hidden="true" />
                {exerciseStep.hint.h1}
              </p>
            </Plane>
          )}
        </>
      )}

      {phase.kind === 'miss' && chosen && (
        <>
          <p className="ad12-ui-text course-exercise__chosen-chip">{chosen.text}</p>
          <DialoguePlane speaker={chosen.reply.speaker} text={chosen.reply.text} />
          <DialoguePlane className="course-exercise__feedback" speaker={courseUi.practice.feedbackSpeaker} text={chosen.feedback} iconUrl={hatenaQuestionUrl} />
          {phaseAudioFailed && (
            <button type="button" className="ad12-ink-button ad12-tappable course-screen__audio-retry" onClick={retry}>{courseUi.audioRetryLabel}</button>
          )}
          <p className="ad12-ui-text">{courseUi.practice.retryPrompt}</p>
          <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={() => setPhase({ kind: 'picking' })}>
            {courseUi.practice.retryLabel}
          </button>
        </>
      )}

      {phase.kind === 'solved' && chosen && (
        <>
          <p className="ad12-ui-text course-exercise__chosen-chip">{chosen.text}</p>
          <DialoguePlane speaker={chosen.reply.speaker} text={chosen.reply.text} />
          <DialoguePlane className="course-exercise__feedback" speaker={courseUi.practice.feedbackSpeaker} text={chosen.feedback} iconUrl={hatenaQuestionUrl} />
          {phaseAudioFailed && !phase.exploring && (
            <button type="button" className="ad12-ink-button ad12-tappable course-screen__audio-retry" onClick={retry}>{courseUi.audioRetryLabel}</button>
          )}

          {isChain && !isLastStep ? (
            <button
              type="button"
              className="ad12-ink-button ad12-tappable course-screen__primary"
              onClick={() => chainNext(exerciseStep!.hint.h2Highlight)}
            >
              {courseUi.practice.nextLabel}
            </button>
          ) : (
            <>
              {chosen.tool && (
                <Plane className="course-exercise__badge">
                  <p className="ad12-ui-text">
                    {isChain ? courseUi.beginnerToolBadgeLabel : courseUi.practice.badgeToolUsed}：「{courseUi.toolLabels[chosen.tool].label}」
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
        </>
      )}
    </main>
  );
}
