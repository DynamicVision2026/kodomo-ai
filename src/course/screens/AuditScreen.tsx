/**
 * WO-C5 §3 screen 3 — チェック (audit). Voiced `q0`/`answer`/`prompt`, then 3 cards; tapping one
 * voices+shows ONLY its own feedback (no reply line, unlike a practice-item option — the audit
 * cards are the child's own guess at "which question opens the tool," not a real dialogue turn).
 * `ok` -> 「できた！」 + next item. Anything else -> feedback + 「もう一回、えらんでみよう。」,
 * removing that card from the choices; with 3 cards and exactly one `ok`, a second miss always
 * narrows to the one remaining (correct) card. No score, no red cross (WO-C5 §3).
 */
import { useState } from 'react';
import { MoveCard } from '../../ad12/MoveCard';
import { Plane } from '../../ad12/Plane';
import { DialoguePlane } from '../DialoguePlane';
import { useVoiceQueue } from '../useVoiceQueue';
import { Ruby } from '../../engine/ruby';
import { courseUi } from '../content/courseManifest';
import {
  auditQ0AudioPath, auditAnswerAudioPath, auditPromptAudioPath,
  auditCardAudioPath, auditCardFeedbackAudioPath,
} from '../audioPaths';
import type { CourseAuditItem } from '../content/types';

export interface AuditScreenProps {
  lessonId: string;
  item: CourseAuditItem;
  position: { index: number; total: number };
  onItemDone: (auditId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

type Phase = { kind: 'picking' } | { kind: 'result'; cardIndex: number } | { kind: 'complete' };

export function AuditScreen({ lessonId, item, position, onItemDone, onNext, onBack }: AuditScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'picking' });
  const [removedIndexes, setRemovedIndexes] = useState<number[]>([]);

  const isLastItem = position.index + 1 >= position.total;

  function choose(cardIndex: number) {
    setPhase({ kind: 'result', cardIndex });
    if (item.cards[cardIndex]![0] === 'ok') onItemDone(item.id);
  }

  function retry(cardIndex: number) {
    setRemovedIndexes((prev) => [...prev, cardIndex]);
    setPhase({ kind: 'picking' });
  }

  function handleNext() {
    if (isLastItem) setPhase({ kind: 'complete' });
    else onNext();
  }

  const card = phase.kind === 'result' ? item.cards[phase.cardIndex] : undefined;

  // Founder iPad Safari fix (28 Sep 2026): see courseAudioPlayer.ts's own doc comment — every
  // VoiceCue this screen used to mount in parallel (q0+answer+prompt all fire together on initial
  // mount) now queues through one shared, already-unlocked <audio> element instead.
  useVoiceQueue([auditQ0AudioPath(lessonId, item.id), auditAnswerAudioPath(lessonId, item.id)], `intro-${item.id}`);
  useVoiceQueue(
    phase.kind === 'picking' ? [auditPromptAudioPath(lessonId, item.id)] : [],
    phase.kind === 'picking' ? `picking-${item.id}-${removedIndexes.length}` : `none-${item.id}`,
  );
  useVoiceQueue(
    phase.kind === 'result' ? [auditCardAudioPath(lessonId, item.id, phase.cardIndex), auditCardFeedbackAudioPath(lessonId, item.id, phase.cardIndex)] : [],
    phase.kind === 'result' ? `result-${item.id}-${phase.cardIndex}` : `none-${item.id}`,
  );

  if (phase.kind === 'complete') {
    return (
      <main className="ad12 course-screen course-audit course-audit--complete">
        <p className="ad12-reading-text">{courseUi.practice.doneLabel}</p>
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onNext}>
          {courseUi.practice.nextLabel}
        </button>
      </main>
    );
  }

  return (
    <main className="ad12 course-screen course-audit">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <div className="course-exercise__dots" aria-hidden="true">
        {Array.from({ length: position.total }, (_, i) => (
          <span key={i} className={`course-exercise__dot ${i < position.index || (i === position.index && phase.kind === 'result' && card?.[0] === 'ok') ? 'course-exercise__dot--done' : ''}`} />
        ))}
      </div>
      <Plane className="course-exercise__scene">
        <p className="ad12-ui-text"><Ruby text={item.scene} /></p>
      </Plane>
      <DialoguePlane speaker={item.q0[0]} text={item.q0[1]} />
      <DialoguePlane speaker={item.answer[0]} text={item.answer[1]} />

      {phase.kind === 'picking' && (
        <>
          <p className="ad12-ui-text">{item.prompt}</p>
          <div className="course-exercise__options">
            {item.cards.map((c, i) => {
              if (removedIndexes.includes(i)) return null;
              return <MoveCard key={i} text={c[1]} onCommit={() => choose(i)} />;
            })}
          </div>
        </>
      )}

      {phase.kind === 'result' && card && (
        <>
          <DialoguePlane speaker={courseUi.practice.feedbackSpeaker} text={card[2]} />
          {card[0] === 'ok' ? (
            <>
              <p className="ad12-reading-text">{courseUi.auditOkLabel}</p>
              <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={handleNext}>
                {courseUi.practice.nextLabel}
              </button>
            </>
          ) : (
            <>
              <p className="ad12-ui-text">{courseUi.practice.retryPrompt}</p>
              <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={() => retry(phase.cardIndex)}>
                {courseUi.practice.retryLabel}
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}
