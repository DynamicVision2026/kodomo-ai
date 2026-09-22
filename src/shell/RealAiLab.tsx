import type { ModuleUiStrings } from '../engine/types';
import { track } from '../engine/analytics';
import { Ruby } from '../engine/ruby';

export interface RealAiLabProps {
  ui: ModuleUiStrings;
  /** Either action leads here — "tried it" and "skip" are equally valid outcomes (WO-34: this
   *  session is optional and must never block course completion). Which one fired is recorded
   *  separately, as an engagement signal only. */
  onContinue: () => void;
}

/**
 * WO-34: the Real AI Lab — exactly one optional, parent-supervised session, reached only from
 * Story 1-8's own 'stage-teachback' return-to-child action (src/shell/MissionShell.tsx's
 * REAL_AI_LAB_MISSION_ID), strictly after that Story's own teach-back and M2b, and strictly
 * before the course-complete screen. Co-play only — solo play never reaches 'stage-teachback' at
 * all (WO-25 #6), so there is no parent here to run this with; that path is unchanged.
 *
 * This screen is facilitation only. The actual exercise happens entirely OUTSIDE this app, on the
 * family's own AI account — the app itself never calls one, exactly as the existing, already-
 * approved Real AI guide (src/print/kit-data/real-ai-guide.json) already states in its own words.
 * The Architect's alignment correction fixed the sequence at four steps, matched by the guide:
 * (1) an everyday question, bare, (2) the same question again with one condition/preference/
 * perspective changed, (3) compare the two answers and notice what the AI knew or didn't know,
 * (4) the child composes the NEXT question aloud, the parent types it, the family looks at that
 * third answer. Steps 1-3 are `ui.realAiLabIntro`; step 4 is `ui.realAiLabStep4` below — still
 * always the PARENT typing, never an app text field (gate:no-free-text scans this whole
 * directory), no runtime LLM call, no provider named as a requirement (ChatGPTなど is an example,
 * same as the existing guide), and nothing the AI says or the parent types is ever sent to or
 * stored by this app. The guide link below opens the same Print Centre route Course Home's own
 * kit button already uses — reusing the approved guide, never rewriting it here.
 */
export function RealAiLab({ ui, onContinue }: RealAiLabProps) {
  function tried() {
    track('real_ai_lab_tried');
    onContinue();
  }
  function skip() {
    track('real_ai_lab_skipped');
    onContinue();
  }
  return (
    <div className="mission-shell__wrapper mission-shell__wrapper--parent">
      <p className="mission-shell__real-ai-lab-heading">{ui.realAiLabHeading}</p>
      <p><Ruby text={ui.realAiLabIntro ?? ''} /></p>
      <p><Ruby text={ui.realAiLabStep4 ?? ''} /></p>
      <p className="mission-shell__real-ai-lab-note">{ui.realAiLabNote}</p>
      <button
        type="button"
        className="mission-shell__real-ai-lab-guide-link"
        onClick={() => window.open('/print/centre/', '_blank', 'noopener')}
      >
        {ui.realAiLabGuideLinkLabel}
      </button>
      <button type="button" onClick={tried}>{ui.handoffContinue}</button>
      <button type="button" className="mission-shell__skip" onClick={skip}>{ui.handoffSkip}</button>
    </div>
  );
}
