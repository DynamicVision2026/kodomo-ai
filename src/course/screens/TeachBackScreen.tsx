/**
 * WO-C2 §3.4 (rewrites WO-C1 §3 screen 6, `{prompt}`-only) — Teach-back（つたえる）. One tool
 * card per tool taught this lesson (`teachBack.cards`), each revealing its own `help` text on
 * demand via 「こまったら見る」. Pressing 「いえた！」 shows 「できたね！」 then moves on. Falls
 * back to the WO-C1 single-prompt-only shape when `cards` is absent (the demo lesson predates
 * this field being required).
 */
import { useState } from 'react';
import { Plane } from '../../ad12/Plane';
import { Ruby } from '../../engine/ruby';
import { useVoiceQueue } from '../useVoiceQueue';
import { courseUi } from '../content/courseManifest';
import { teachBackPromptAudioPath } from '../audioPaths';
import type { CourseTeachBack } from '../content/types';

export interface TeachBackScreenProps {
  lessonId: string;
  teachBack: CourseTeachBack;
  onTeachBackDone: () => void;
  onBack: () => void;
}

export function TeachBackScreen({ lessonId, teachBack, onTeachBackDone, onBack }: TeachBackScreenProps) {
  const [done, setDone] = useState(false);
  const [revealedHelp, setRevealedHelp] = useState<Set<number>>(new Set());

  // Founder iPad Safari fix (28 Sep 2026): see courseAudioPlayer.ts's own doc comment — a fresh
  // <audio> element per screen mount needs its OWN gesture activation; this shared, already-
  // unlocked element doesn't.
  useVoiceQueue([teachBackPromptAudioPath(lessonId)], `intro-${lessonId}`);

  function toggleHelp(i: number) {
    setRevealedHelp((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function handleDone() {
    // Shows 「できたね！」 first — the actual `onTeachBackDone` (marks progress + navigates back
    // to the lesson hub) fires only once the child taps つぎへ below, per WO-C2 §3.4: "「いえた！」
    // shows「できたね！」and moves on" (a two-beat confirmation, not an instant navigation).
    setDone(true);
  }

  return (
    <main className="ad12 course-screen course-teachback">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <Plane>
        <p className="ad12-reading-text"><Ruby text={teachBack.prompt} /></p>
      </Plane>

      {teachBack.cards?.map((card, i) => (
        <Plane key={card.tool} className="course-teachback__card">
          <p className="ad12-reading-text"><Ruby text={card.frame} /></p>
          <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => toggleHelp(i)}>
            {courseUi.teachBackHelpLabel}
          </button>
          {revealedHelp.has(i) && <p className="ad12-ui-text course-teachback__help"><Ruby text={card.help} /></p>}
        </Plane>
      ))}

      {teachBack.parentNote && (
        <p className="ad12-ui-text course-teachback__parent-note">{courseUi.parentNoteLabel}：{teachBack.parentNote}</p>
      )}

      {done ? (
        <>
          <p className="ad12-reading-text course-teachback__done-note">{courseUi.teachBackDoneNote}</p>
          <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onTeachBackDone}>
            {courseUi.teachBackContinueLabel}
          </button>
        </>
      ) : (
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={handleDone}>
          {courseUi.teachBackDoneLabel}
        </button>
      )}
    </main>
  );
}
