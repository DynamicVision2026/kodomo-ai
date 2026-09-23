import { Ruby } from '../engine/ruby';
import { GuidanceAffordance } from './GuidanceAffordance';
import type { GuidanceLevel } from '../stage/Guidance';
import './primitives.css';
import './answer-plane.css';

export interface AnswerPlaneProps {
  /** ロボ's current answer (`currentAnswer(digPhase, state)`) — read verbatim, never paraphrased. */
  text: string;
  /** `guidanceLevelFor('yomu', profile.guidance)` — this component never derives the level
   *  itself, matching AD-12 F2 ("per profile, per verb, counts successful uses"). */
  guidanceLevel: GuidanceLevel;
  onReadOn?: () => void;
  readOnLabel: string;
  /** Real-coverage addition: who is speaking this line, when more than one voice can appear in
   *  the live dig flow (the robot's own answer vs. the challenger's own challenge) — the same
   *  small, quiet ui-text treatment VoicePlane already gives its own speaker line, not a new
   *  visual language. Omitted for the ordinary single-voice case (AD-12 §4 state 1's own gallery
   *  fixture). */
  speakerLabel?: string;
  /** Real-coverage addition: an extra class on the outer element — lets a live caller (e.g.
   *  SpeechBubble.tsx, reskinned onto this component) keep its own stable behavioural class
   *  alongside AD-12's own, without a second wrapper element. Never used for copy. */
  className?: string;
}

/**
 * AD-12 §4 state 1 / §3 "Read on": one dominant reading object (the answer) + one action area
 * (▼) + quiet context — the resting shape every dig beat returns to. ▼ is the only bright mark
 * on the plane (F1: the cue targets ▼ as a whole, never a word inside the sentence).
 *
 * The WHOLE plane is the tap target, not just the ▼ glyph — AD-07's own "tapping anywhere on it
 * advances... the blinking ▼ is only the affordance TELLING the child there's more to do" (large,
 * forgiving tap targets for young children) is an instructional-ergonomics rule AD-12's visual
 * layer implements, not overrides; ▼ stays the one visual/guidance cue (F1), it was never meant
 * to be the one tappable pixel. A real `<button>` root (not a `<div>` wrapping a nested button —
 * two nested interactive elements is invalid HTML) keeps that "tap anywhere" contract exactly.
 */
export function AnswerPlane({ text, guidanceLevel, onReadOn, readOnLabel, speakerLabel, className }: AnswerPlaneProps) {
  return (
    <button
      type="button"
      className={`ad12-plane ad12-answer-plane${className ? ` ${className}` : ''}`}
      onClick={onReadOn}
      aria-label={readOnLabel}
    >
      {speakerLabel && <p className="ad12-ui-text ad12-answer-plane__speaker">{speakerLabel}</p>}
      <p className="ad12-reading-text"><Ruby text={text} /></p>
      <GuidanceAffordance level={guidanceLevel}>
        {/* `ad12-tappable` here is sizing only (min 48px, F8) — the ▼ itself is no longer its
           own tap target (the whole plane is), but the guidance cue box around it keeps the
           same footprint Pass 1 already established rather than shrinking to the glyph alone. */}
        <span className="ad12-answer-plane__advance ad12-tappable" aria-hidden="true">▼</span>
      </GuidanceAffordance>
    </button>
  );
}
