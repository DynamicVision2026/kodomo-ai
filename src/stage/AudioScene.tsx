import { useState } from 'react';
import type { ModuleUiStrings } from '../engine/types';
import type { AudioRole } from '../audio/types';
import { Mascot } from '../shell/Mascot';
import { SpeechBubble } from './SpeechBubble';
import '../shell/mission-shell.css';

export interface AudioSceneProps {
  role: AudioRole;
  /** The mission's own authored layer-0 robotSays, verbatim — see src/audio/types.ts's own doc
   *  comment on `AudioScript.robotLine` for why this is never new copy authored here. */
  robotLine: string;
  ui: ModuleUiStrings;
  onDone: () => void;
}

/**
 * AD-10 / Audio Reference Scripts rev.3: the child-facing screen for a mission's own MODEL/
 * GUIDED/CHECKPOINT reference audio. Real recorded audio doesn't exist yet — rev.3 is itself a
 * pre-recording reference script, still pending 酒井先生's native review of its ROBOT lines — so
 * this screen is the PRODUCT PATH the audio will play through once it does: correct placement
 * (decided entirely by src/shell/MissionShell.tsx, never this component) and one explicit
 * continue action, tap-to-advance exactly like every other dialogue beat in the app (WO-24 §4A).
 *
 * Deliberately does not render rev.3's own multi-turn GUIDE/PONTA dialogue as an on-screen
 * transcript: rev.3 itself flags that "any transcript shown on screen needs a Stage 2 ruby pass
 * per AD-05 §3" — not yet done, and doing it here would be real content authoring, not
 * engineering. The one line this screen DOES show — the mission's own layer-0 `robotSays` — is
 * exempt: it is already-reviewed, already-ruby-safe Stage 2 content, copied verbatim (never
 * paraphrased) from the mission's own s2.json, so showing it introduces no new unreviewed text.
 */
export function AudioScene({ role, robotLine, ui, onDone }: AudioSceneProps) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="mission-shell__wrapper" data-audio-role={role}>
      <Mascot state="curious" />
      {!revealed ? (
        <SpeechBubble text={ui.audioListenPrompt ?? ''} onAdvance={() => setRevealed(true)} />
      ) : (
        <SpeechBubble speaker={ui.stageRobotName} text={robotLine} onAdvance={onDone} />
      )}
    </div>
  );
}
