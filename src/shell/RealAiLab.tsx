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
 * This screen is facilitation only. The actual exercise — asking a real generative AI (the
 * family's own account, e.g. ChatGPT) the same question twice, changing one condition the second
 * time, and comparing — happens entirely OUTSIDE this app, exactly as the existing, already-
 * approved Real AI guide (src/print/kit-data/real-ai-guide.json) already describes: "アプリの中で
 * AIが呼ばれることはありません". No text input lives here (gate:no-free-text scans this whole
 * directory), no runtime LLM call, no provider named as a requirement (ChatGPTなど is an example,
 * same as the existing guide), nothing typed anywhere is ever sent to this app. The guide link
 * below opens the same Print Centre route Course Home's own kit button already uses — reusing
 * the approved guide, never rewriting it.
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
