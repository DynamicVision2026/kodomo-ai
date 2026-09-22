import { useEffect, useRef } from 'react';
import { Ruby } from '../engine/ruby';
import { animate, tokenMs } from './motion';
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
export function VoicePlane({ speaker, text, speakerLabel, variant = 'normal' }: VoicePlaneProps) {
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

  return (
    <div className={`ad12-voice-plane ad12-voice-plane--${speaker.toLowerCase()} ad12-voice-plane--${variant}`}>
      <p className="ad12-ui-text ad12-voice-plane__speaker">{speakerLabel}</p>
      <p ref={textRef} className="ad12-reading-text"><Ruby text={text} /></p>
    </div>
  );
}
