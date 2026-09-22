import { useState } from 'react';
import type { ModuleUiStrings } from '../engine/types';
import { Ruby } from '../engine/ruby';

export interface CompletionRitualProps {
  ui: ModuleUiStrings;
  onDone: () => void;
}

type Step = 'write' | 'compare' | 'certificate';

/**
 * Architect-resolved completion-ritual behaviours #2-#7. Reached only from
 * src/shell/MissionShell.tsx, strictly after Story 1-8's own teach-back/M2b and the optional
 * Real AI Lab (if the family chose it — either outcome of that screen leads here identically, so
 * skipping it reaches this ritual exactly as directly as trying it does). Three steps, one
 * always-available primary action each, same idiom as every other wrapper screen in this shell:
 *
 * 1. 'write' — the exact same baseline prompt as M0 (`ui.m0ChildPrompt`, "the exact same
 *    baseline topic used at M0 returns at completion") and the same parent-facing writing
 *    instructions (`m0ParentIntro`/`m0ParentStep1-4`) — child and parent each write one question
 *    again, on paper. Nothing captured here either: no text input anywhere in this component
 *    (gate:no-free-text).
 * 2. 'compare' — reached ONLY once both have written (this screen's own primary action gates
 *    it). `m0ParentForward` is the Architect's own instruction for this exact moment: open the
 *    sealed M0 envelope and compare all four questions side by side, themselves, on paper — no
 *    scoring, no judgement, no captured answers; this app has no digital record of any of the
 *    four questions to display even if it wanted to.
 * 3. 'certificate' — 親子認定証 is issued: this app never renders its content (the certificate
 *    already exists as its own approved Print Centre item, src/print/kit-data/certificate.json,
 *    opened here via the same `courseHomeKitLabel` link Course Home's own kit button uses).
 *    `certificateBlankLabel` is shown verbatim, its ○○/＿＿ never filled in by this app — only a
 *    parent, by hand, ever writes on the printed page.
 *
 * `onDone` leads to the existing, unchanged course-complete `MissionComplete` screen.
 */
export function CompletionRitual({ ui, onDone }: CompletionRitualProps) {
  const [step, setStep] = useState<Step>('write');

  if (step === 'write') {
    return (
      <div className="mission-shell__wrapper mission-shell__wrapper--parent mission-shell__completion-ritual">
        <p className="mission-shell__m0-child-prompt"><Ruby text={ui.m0ChildPrompt ?? ''} /></p>
        <div className="mission-shell__m0-parent-instruction">
          <p>{ui.m0ParentIntro}</p>
          <p>{ui.m0ParentStep1}</p>
          <p>{ui.m0ParentStep2}</p>
          <p>{ui.m0ParentStep3}</p>
          <p>{ui.m0ParentStep4}</p>
        </div>
        <button type="button" onClick={() => setStep('compare')}>{ui.handoffContinue}</button>
      </div>
    );
  }

  if (step === 'compare') {
    return (
      <div className="mission-shell__wrapper mission-shell__wrapper--parent mission-shell__completion-ritual">
        <p>{ui.m0ParentForward}</p>
        <button type="button" onClick={() => setStep('certificate')}>{ui.handoffContinue}</button>
      </div>
    );
  }

  return (
    <div className="mission-shell__wrapper mission-shell__wrapper--parent mission-shell__completion-ritual">
      <p className="mission-shell__certificate-heading">{ui.certificateHeading}</p>
      <p className="mission-shell__certificate-blank">{ui.certificateBlankLabel}</p>
      <button
        type="button"
        className="mission-shell__certificate-kit-link"
        onClick={() => window.open('/print/centre/', '_blank', 'noopener')}
      >
        {ui.courseHomeKitLabel}
      </button>
      <button type="button" onClick={onDone}>{ui.handoffContinue}</button>
    </div>
  );
}
