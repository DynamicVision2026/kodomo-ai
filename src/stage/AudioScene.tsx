import { useEffect, useRef, useState } from 'react';
import type { ModuleUiStrings } from '../engine/types';
import type { AudioLine, AudioRole } from '../audio/types';
import { Mascot } from '../shell/Mascot';
import { SpeechBubble } from './SpeechBubble';
import { Ruby } from '../engine/ruby';
import '../shell/mission-shell.css';

export interface AudioSceneProps {
  role: AudioRole;
  /** The mission's own authored layer-0 robotSays, verbatim — see src/audio/types.ts's own doc
   *  comment on `AudioScript.robotLine` for why this is never new copy authored here. Used by
   *  the text-anchor fallback (`lines` absent); ignored once real audio exists. */
  robotLine: string;
  /** The real, per-line playback manifest — present only once real MP3s are committed
   *  (AudioScript.audioStatus 'ready'). Its presence alone decides which of the two screens
   *  below renders; nothing else does. */
  lines?: AudioLine[];
  ui: ModuleUiStrings;
  onDone: () => void;
}

/**
 * AD-10 / Audio Reference Scripts rev.3: the child-facing screen for a mission's own MODEL/
 * GUIDED/CHECKPOINT reference audio. Pure dispatcher (no hooks of its own — React's rules of
 * hooks forbid an early-return before a hook call, so each real screen below owns its own state)
 * between the two states a mission's audio can be in: real committed MP3s (`lines` present) or
 * still pending production (`lines` absent) — see AudioScript.audioStatus's own doc comment.
 */
export function AudioScene({ role, robotLine, lines, ui, onDone }: AudioSceneProps) {
  if (lines && lines.length > 0) {
    return <FullAudioScene role={role} lines={lines} ui={ui} onDone={onDone} />;
  }
  return <TextAnchorAudioScene role={role} robotLine={robotLine} ui={ui} onDone={onDone} />;
}

/**
 * WO-33 fallback, unchanged: real recorded audio doesn't exist yet for this mission, so this is
 * the PRODUCT PATH the audio will play through once it does — correct placement (decided entirely
 * by src/shell/MissionShell.tsx, never this component) and one explicit continue action, tap-to-
 * advance exactly like every other dialogue beat in the app (WO-24 §4A).
 *
 * Deliberately does not render rev.3's own multi-turn GUIDE/PONTA dialogue as an on-screen
 * transcript: rev.3 itself flags that "any transcript shown on screen needs a Stage 2 ruby pass
 * per AD-05 §3" — not yet done, and doing it here would be real content authoring, not
 * engineering. The one line this screen DOES show — the mission's own layer-0 `robotSays` — is
 * exempt: it is already-reviewed, already-ruby-safe Stage 2 content, copied verbatim (never
 * paraphrased) from the mission's own s2.json, so showing it introduces no new unreviewed text.
 */
function TextAnchorAudioScene({ role, robotLine, ui, onDone }: Omit<AudioSceneProps, 'lines'>) {
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

/**
 * WO-35: real sequential playback of a mission's own committed MP3s (Story 1-1/chanto is the
 * first — the Founder-approved production reference). Plays each line's own `<audio>` in order,
 * holding its own `pauseAfterMs` gap between them, restarting from the first line each time
 * "play" is tapped. `onDone` (the existing, always-available continue action) can fire at ANY
 * point — mid-playback or before ever pressing play — and stops whatever is playing first: this
 * screen can never block course progress on the child having actually listened (WO-33's own
 * "optional, never blocks" invariant, unchanged).
 */
function FullAudioScene({ role, lines, ui, onDone }: Required<Pick<AudioSceneProps, 'role' | 'lines' | 'ui' | 'onDone'>>) {
  const [index, setIndex] = useState(-1); // -1 = not yet started
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  function stopPlayback() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  useEffect(() => stopPlayback, []);

  function playFrom(i: number) {
    if (i >= lines.length) { setIndex(lines.length); return; }
    setIndex(i);
    const audio = new Audio(lines[i]!.audioUrl);
    audioRef.current = audio;
    const advance = () => {
      timeoutRef.current = window.setTimeout(() => playFrom(i + 1), lines[i]!.pauseAfterMs);
    };
    audio.addEventListener('ended', advance);
    // A rejected/no-op play() (autoplay policy, or a test environment with no real media
    // pipeline) still has to progress the sequence rather than stall on it forever.
    audio.play().catch(advance);
  }

  const playing = index >= 0 && index < lines.length;

  return (
    <div className="mission-shell__wrapper" data-audio-role={role}>
      <Mascot state={playing ? 'curious' : 'thinking'} />
      <p><Ruby text={ui.audioListenPrompt ?? ''} /></p>
      <button type="button" onClick={() => playFrom(0)} disabled={playing}>
        {ui.audioPlayLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          stopPlayback();
          onDone();
        }}
      >
        {ui.handoffContinue}
      </button>
    </div>
  );
}
