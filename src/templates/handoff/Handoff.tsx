import { Ruby } from '../../engine/ruby';
import './handoff.css';

export interface HandoffProps {
  /** Fixed UI copy from module.json — templates never hard-code child-facing text (CI gate 3). */
  prompt: string;
  continueLabel: string;
  /** Omit to render only the one handoff action — WO-24 (AD-07 §4D): "child sees only [the
   *  prompt] and one action." Every existing caller still passes this and keeps its skip
   *  button exactly as before. */
  skipLabel?: string;
  /** Called once the adult has the device and taps through. */
  onContinue: () => void;
  /** Solo play / opting out of this handoff. Spec v0.5 pillar 5: co-play is never required.
   *  Unused (and may be omitted) when `skipLabel` is omitted. */
  onSkip?: () => void;
}

/**
 * Reusable pass-the-device screen. Spec v0.5 §4.2 (「おとなにわたしてね」), §5 step 9.
 * Deliberately generic — used inside prediction-battle between the child and parent taps,
 * and reusable anywhere else a mission needs to hand control to an adult.
 */
export function Handoff({ prompt, continueLabel, skipLabel, onContinue, onSkip }: HandoffProps) {
  return (
    <div className="handoff">
      <span className="handoff__icon" aria-hidden="true">📱</span>
      <p className="handoff__prompt">
        <Ruby text={prompt} />
      </p>
      <button type="button" className="handoff__continue" onClick={onContinue}>
        {continueLabel}
      </button>
      {skipLabel && (
        <button type="button" className="handoff__skip" onClick={onSkip}>
          {skipLabel}
        </button>
      )}
    </div>
  );
}
