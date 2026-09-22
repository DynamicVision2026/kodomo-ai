import { useEffect, useRef } from 'react';
import { Ruby } from '../engine/ruby';
import type { RootForm } from './rootForm';
import { animate, tokenMs } from './motion';
import './primitives.css';
import './root-plane.css';

export interface RootPlaneProps {
  /** ロボ's root answer (`phase.root.robotSays`) — the same reading-plane treatment as any
   *  other answer, per F5: "the root uses the same settle spring as everything else. There is
   *  no celebration motion." */
  text: string;
  /** Resolved by `rootFormFor` (rootForm.ts) from the mission's own authored rootType — this
   *  component never sees or interprets the raw rootType string itself. */
  form: RootForm;
}

/**
 * AD-12 §4 state 8: white plane, one yellow hairline, and one of the three static forms F5
 * authors: めあて (upward), しくみ (interlocking), わかれ (two equal planes, neither emphasised).
 * No celebration motion, no confetti/badge (§3 "Rejected") — the ONLY difference from an
 * ordinary answer plane is the hairline and the form glyph beneath the text.
 *
 * Pass 2: F5's own words are "the root uses the same settle spring as everything else" — so on
 * arrival this plays the SAME opacity/position settle every other plane in this library uses
 * (SlipCascade's entrance, MoveCard's magnify->committed), at the same --ad12-t-settle duration.
 * Deliberately not a distinct "root" motion of its own; that would read as a celebration.
 */
export function RootPlane({ text, form }: RootPlaneProps) {
  const planeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = planeRef.current;
    if (!el) return;
    animate(
      el,
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: tokenMs('--ad12-t-settle', 450, el) },
    );
    // Replays if the child reaches a different root (a new form/text), not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, text]);

  return (
    <div ref={planeRef} className="ad12-root-plane">
      <p className="ad12-reading-text"><Ruby text={text} /></p>
      <RootFormGlyph form={form} />
    </div>
  );
}

function RootFormGlyph({ form }: { form: RootForm }) {
  if (form === 'upward') {
    return (
      <svg className="ad12-root-form" viewBox="0 0 64 48" aria-hidden="true">
        <path d="M32 4 L58 40 L6 40 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    );
  }
  if (form === 'interlocking') {
    return (
      <svg className="ad12-root-form" viewBox="0 0 64 48" aria-hidden="true">
        <circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="40" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    );
  }
  // twoEqual — literally two identical planes, side by side, same weight, same hairline.
  return (
    <div className="ad12-root-form ad12-root-form--two-equal">
      <span className="ad12-root-form__half" />
      <span className="ad12-root-form__half" />
    </div>
  );
}
