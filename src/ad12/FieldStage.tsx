import type { ReactNode } from 'react';
import './primitives.css';
import './field-stage.css';

/** One step per breakthrough (Progress Fill, §3 token table) — 0/1/2 are the three shallow
 *  layers' own field tones; 'deep' is listening/root, the field's own darkest resting state. */
export type FieldTone = 0 | 1 | 2 | 'deep';

export interface FieldStageProps {
  /** The mission's own current dig layer index (`DigState.layer`), or 'deep' at root/listening —
   *  read directly off engine state, never decided here. Clamped to the 3 declared tones so a
   *  mission with more than 3 layers doesn't run off the ramp; the ramp is a resting-depth cue,
   *  not a literal per-layer palette. */
  tone: FieldTone;
  children: ReactNode;
}

/** AD-12's field ramp — the ONE background family every stage scene renders inside, stepping
 *  one tone deeper per breakthrough (Breakthrough, §3 grammar: "the field steps one tone
 *  deeper"). Purely presentational: `tone` is supplied by the caller from real DigState/atRoot,
 *  this component makes no correctness or progression decision of its own. */
export function FieldStage({ tone, children }: FieldStageProps) {
  const clamped: FieldTone = tone === 'deep' ? 'deep' : (Math.min(tone, 2) as 0 | 1 | 2);
  return (
    <div className={`ad12-field ad12-field--${clamped}`} data-field-tone={clamped}>
      {children}
    </div>
  );
}
