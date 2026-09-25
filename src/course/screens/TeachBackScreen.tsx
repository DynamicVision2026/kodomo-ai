/** WO-C1 §3 screen 6 — Teach-back. A single explicit done action, mirroring `TeachBackPanel`'s
 *  own parent-confirm idea but built fresh here since that component's props
 *  (`m2ConfirmPrompt`/`m2Confirmed`/`ouchiTalk`) are typed around the Playground's own M2b
 *  milestone semantics, not this lesson-local boolean. */
import { Plane } from '../../ad12/Plane';
import { Ruby } from '../../engine/ruby';
import { courseUi } from '../content/courseManifest';

export interface TeachBackScreenProps {
  prompt: string;
  onTeachBackDone: () => void;
  onBack: () => void;
}

export function TeachBackScreen({ prompt, onTeachBackDone, onBack }: TeachBackScreenProps) {
  return (
    <main className="ad12 course-screen course-teachback">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <Plane>
        <p className="ad12-reading-text"><Ruby text={prompt} /></p>
      </Plane>
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onTeachBackDone}>
        {courseUi.teachBackDoneLabel}
      </button>
    </main>
  );
}
