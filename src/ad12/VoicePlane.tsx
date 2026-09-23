import { useEffect, useRef } from 'react';
import { Ruby } from '../engine/ruby';
import { animate, tokenMs } from './motion';
import { GuidanceAffordance } from './GuidanceAffordance';
import type { GuidanceLevel } from '../stage/Guidance';
import './primitives.css';
import './voice-plane.css';

export type Speaker = 'GUIDE' | 'PONTA' | 'ROBOT';

export interface VoicePlaneProps {
  speaker: Speaker;
  /** F8: every audio line is shown as text on its own voice plane, so it works muted. This is
   *  never optional — there is no audio-only path through this component. */
  text: string;
  speakerLabel: string;
  /** Distinguishes which grammar-table row this plane renders — purely a class hook (no
   *  behavioural branch here): 'flatReply' (Miss), 'challenge' (Early わかった), 'refrain'
   *  (Refrain pause morph target), 'normal' (an ordinary audio line). */
  variant?: 'normal' | 'flatReply' | 'challenge' | 'refrain';
  /** Builder work order §3: opts this plane into the SAME "tap anywhere to continue" contract
   *  AnswerPlane already gives every dialogue beat — a ▼ affordance, whole-plane tap target.
   *  Omitted (every pre-existing caller: the design gallery's Pass 1 fixtures, and any future
   *  audio-synced Listening Pocket line whose advance is externally driven by playback, not a
   *  tap) keeps this component exactly as it always was — a plain, non-interactive reading
   *  plane. Passed: this stays required alongside `advanceLabel`. */
  onAdvance?: () => void;
  /** Required whenever `onAdvance` is passed — the advance button's accessible name, same
   *  contract AnswerPlane's own `readOnLabel` already has. */
  advanceLabel?: string;
  /** Same meaning as AnswerPlane's own `guidanceLevel` — only consulted when `onAdvance` is
   *  passed. Defaults to 'independent' (no cue) otherwise, matching AnswerPlane's own default. */
  guidanceLevel?: GuidanceLevel;
}

/**
 * AD-12 §3 "An audio line | voice plane | one plane per speaker; the text crossfades" and its
 * Miss/Early-わかった/Refrain variants (F5/F6). ポン太 is warm tan here (`--ad12-ponta`), never
 * accent-yellow (§1 confirmation #4, F7) — the only speaker-specific colour this component ever
 * applies, and it is never the same yellow the child's own accent uses.
 *
 * Pass 2: "the text crossfades" — when the SAME plane's `text` changes (the guide advancing to
 * its next line, a Miss reply landing), the reading text fades rather than jump-cutting. Skipped
 * on the very first render (a fresh plane arriving has no prior line to fade from) and on a
 * speaker change (that's a different plane's identity, not a line swap on this one).
 */
export function VoicePlane({
  speaker, text, speakerLabel, variant = 'normal', onAdvance, advanceLabel, guidanceLevel,
}: VoicePlaneProps) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const prevRef = useRef<{ speaker: Speaker; text: string }>({ speaker, text });

  useEffect(() => {
    const prev = prevRef.current;
    const el = textRef.current;
    if (el && prev.speaker === speaker && prev.text !== text) {
      animate(el, [{ opacity: 0 }, { opacity: 1 }], {
        duration: tokenMs('--ad12-t-settle', 450, el),
      });
    }
    prevRef.current = { speaker, text };
  }, [speaker, text]);

  const className = `ad12-voice-plane ad12-voice-plane--${speaker.toLowerCase()} ad12-voice-plane--${variant}`;
  const body = (
    <>
      <p className="ad12-ui-text ad12-voice-plane__speaker">{speakerLabel}</p>
      <p ref={textRef} className="ad12-reading-text"><Ruby text={text} /></p>
    </>
  );

  if (!onAdvance) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button
      type="button"
      className={`${className} ad12-voice-plane--interactive`}
      onClick={onAdvance}
      aria-label={advanceLabel}
    >
      {body}
      <GuidanceAffordance level={guidanceLevel ?? 'independent'}>
        <span className="ad12-voice-plane__advance ad12-tappable" aria-hidden="true">▼</span>
      </GuidanceAffordance>
    </button>
  );
}
