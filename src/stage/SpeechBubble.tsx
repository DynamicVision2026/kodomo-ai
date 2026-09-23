import { AnswerPlane } from '../ad12/AnswerPlane';
import type { GuidanceLevel } from './Guidance';
import './speech-bubble.css';

export interface SpeechBubbleProps {
  /** Who's speaking — a name only, never a "Robot:"/"Ponta:" label the child has to parse. */
  speaker?: string;
  /** Ruby markup allowed: {漢字|かんじ} */
  text: string;
  onAdvance: () => void;
  /** Extra class(es) for the root element — e.g. the root-reveal motion. Never used for copy. */
  className?: string;
  /** AD-12 cutover: every SpeechBubble advance in MissionStage is a real `yomu` completion
   *  (`onGuidanceUse('yomu')` fires on every one of them) — the caller threads
   *  `guidanceLevelFor('yomu', ...)` through here so AD-12's own guidance affordance (F1/F2) can
   *  finally show on this verb, same as it already does on えらぶ/みきわめる. Omitted (AudioScene's
   *  own two usages, which never track yomu guidance) -> 'independent', i.e. no affordance at
   *  all — exactly this component's own behaviour before this prop existed. */
  guidanceLevel?: GuidanceLevel;
  /** A real UI string for the advance action's accessible name (AnswerPlane's own `readOnLabel`
   *  is required) — every caller already has `ui.handoffContinue` in scope for this. */
  advanceLabel: string;
}

/**
 * WO-24 (AD-07 §4A よむ/Read): the dialogue bubble IS the interaction target — tapping anywhere
 * on it advances (AD-12's AnswerPlane, which this now renders, keeps that "whole plane is the
 * tap target" contract — see AnswerPlane.tsx's own doc comment). No 「つぎへ」/「続ける」 button ever
 * sits next to it; the ▼ is the only affordance telling the child there's more to do here.
 *
 * AD-12 cutover: this component's own external contract (speaker?/text/onAdvance/className) is
 * unchanged from before the cutover — every existing caller (MissionStage.tsx, AudioScene.tsx)
 * keeps working as-is, with the two new props above threaded through where a caller has real
 * guidance state to offer. `.speech-bubble` stays a real class on the rendered root precisely so
 * it keeps working as the stable "a dialogue bubble is showing" hook the test suite already uses
 * (`document.querySelector('.speech-bubble')`) — the paint underneath is now genuinely AD-12's
 * own paper/ink/▼ treatment and motion grammar, not a parallel visual system.
 */
export function SpeechBubble({ speaker, text, onAdvance, className, guidanceLevel, advanceLabel }: SpeechBubbleProps) {
  return (
    <AnswerPlane
      text={text}
      speakerLabel={speaker}
      guidanceLevel={guidanceLevel ?? 'independent'}
      onReadOn={onAdvance}
      readOnLabel={advanceLabel}
      className={`speech-bubble stage__beat-enter${className ? ` ${className}` : ''}`}
    />
  );
}
