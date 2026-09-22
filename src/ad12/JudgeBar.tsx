import { useState } from 'react';
import './primitives.css';
import './judge-bar.css';

export interface JudgeBarProps {
  gotItLabel: string;
  notEnoughLabel: string;
  onGotIt?: () => void;
  onNotEnough?: () => void;
  /** Omitted (the normal, interactive case): the bar tracks its own choice from real clicks —
   *  press-scale and "the chosen half takes the space" both already play from the existing CSS
   *  transition on `.ad12-judge-bar__half` (transform + flex-grow), Pass 2 only needed a real
   *  state change to drive it. Passed explicitly: a static snapshot for a screenshot fixture,
   *  frozen on one moment — clicks still fire the callback but no longer move the bar itself. */
  pressed?: 'gotIt' | 'notEnough' | null;
}

/** AD-12 §3 "Judge" row — the 「これでOK？」 gate. Two equal halves at rest (F3: equal weight),
 *  never colour-coded as right/wrong (there is no wrong side, only "enough" vs "not yet"). Once
 *  either half is chosen it stays chosen — this is a one-shot gate, not a toggle, matching F4's
 *  own "the event fires exactly once" discipline for the sibling Move grammar. */
export function JudgeBar({ gotItLabel, notEnoughLabel, onGotIt, onNotEnough, pressed }: JudgeBarProps) {
  const [choice, setChoice] = useState<'gotIt' | 'notEnough' | null>(null);
  const controlled = pressed !== undefined;
  const effective = controlled ? pressed : choice;

  function handleGotIt() {
    if (!controlled && choice === null) setChoice('gotIt');
    onGotIt?.();
  }
  function handleNotEnough() {
    if (!controlled && choice === null) setChoice('notEnough');
    onNotEnough?.();
  }

  return (
    <div className="ad12-judge-bar" role="group">
      <button
        type="button"
        className={`ad12-judge-bar__half ad12-tappable ad12-ui-text${effective === 'gotIt' ? ' is-pressed' : ''}${effective === 'notEnough' ? ' is-yielding' : ''}`}
        onClick={handleGotIt}
      >
        {gotItLabel}
      </button>
      <button
        type="button"
        className={`ad12-judge-bar__half ad12-tappable ad12-ui-text${effective === 'notEnough' ? ' is-pressed' : ''}${effective === 'gotIt' ? ' is-yielding' : ''}`}
        onClick={handleNotEnough}
      >
        {notEnoughLabel}
      </button>
    </div>
  );
}
