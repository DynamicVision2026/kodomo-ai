import { Ruby } from '../engine/ruby';
import './speech-bubble.css';

export interface SpeechBubbleProps {
  /** Who's speaking — a name only, never a "Robot:"/"Ponta:" label the child has to parse. */
  speaker?: string;
  /** Ruby markup allowed: {漢字|かんじ} */
  text: string;
  onAdvance: () => void;
}

/**
 * WO-24 (AD-07 §4A よむ/Read): the dialogue bubble IS the interaction target — tapping anywhere
 * on it advances. No 「つぎへ」/「続ける」 button ever sits next to it; the blinking ▼ is the only
 * affordance telling the child there's more to do here.
 */
export function SpeechBubble({ speaker, text, onAdvance }: SpeechBubbleProps) {
  return (
    <button type="button" className="speech-bubble stage__beat-enter" onClick={onAdvance}>
      {speaker && <span className="speech-bubble__speaker">{speaker}</span>}
      <span className="speech-bubble__text"><Ruby text={text} /></span>
      <span className="speech-bubble__more" aria-hidden="true">▼</span>
    </button>
  );
}
