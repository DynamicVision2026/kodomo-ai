import { Ruby } from '../engine/ruby';
import { Plane } from './Plane';
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
}

/**
 * AD-12 §4 state 1 / §3 "Read on": one dominant reading object (the answer) + one action area
 * (▼) + quiet context — the resting shape every dig beat returns to. ▼ is the only bright mark
 * on the plane (F1: the cue targets ▼ as a whole, never a word inside the sentence).
 */
export function AnswerPlane({ text, guidanceLevel, onReadOn, readOnLabel }: AnswerPlaneProps) {
  return (
    <Plane className="ad12-answer-plane">
      <p className="ad12-reading-text"><Ruby text={text} /></p>
      <GuidanceAffordance level={guidanceLevel}>
        <button
          type="button"
          className="ad12-answer-plane__advance ad12-tappable"
          onClick={onReadOn}
          aria-label={readOnLabel}
        >
          <span aria-hidden="true">▼</span>
        </button>
      </GuidanceAffordance>
    </Plane>
  );
}
