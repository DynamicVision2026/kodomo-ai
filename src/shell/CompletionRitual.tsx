import { useState } from 'react';
import type { ModuleUiStrings } from '../engine/types';
import { Ruby } from '../engine/ruby';
import { Plane } from '../ad12/Plane';
import '../ad12/tokens.css';
import '../ad12/primitives.css';
import './completion-ritual.css';

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
 *
 * AD-12 cutover: a parent-register surface, restyled with AD-12's own Plane/ink-button treatment
 * (F7: "parent actions use ink, never yellow") — its own dedicated wrapper class (not the shared
 * `.mission-shell__wrapper`/`--parent`, whose own button styling several OTHER, out-of-scope
 * MissionShell screens still depend on unchanged) so this restyle can't leak into them.
 * `.mission-shell__completion-ritual` itself stays, unchanged, as the test suite's own stable
 * "which screen is showing" hook.
 */
export function CompletionRitual({ ui, onDone }: CompletionRitualProps) {
  const [step, setStep] = useState<Step>('write');

  if (step === 'write') {
    return (
      <div className="ad12 completion-ritual mission-shell__completion-ritual">
        <Plane className="completion-ritual__plane">
          <p className="ad12-reading-text"><Ruby text={ui.m0ChildPrompt ?? ''} /></p>
          <div className="completion-ritual__parent-instruction">
            <p className="ad12-ui-text">{ui.m0ParentIntro}</p>
            <p className="ad12-ui-text">{ui.m0ParentStep1}</p>
            <p className="ad12-ui-text">{ui.m0ParentStep2}</p>
            <p className="ad12-ui-text">{ui.m0ParentStep3}</p>
            <p className="ad12-ui-text">{ui.m0ParentStep4}</p>
          </div>
          <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setStep('compare')}>
            {ui.handoffContinue}
          </button>
        </Plane>
      </div>
    );
  }

  if (step === 'compare') {
    return (
      <div className="ad12 completion-ritual mission-shell__completion-ritual">
        <Plane className="completion-ritual__plane">
          <p className="ad12-reading-text">{ui.m0ParentForward}</p>
          <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setStep('certificate')}>
            {ui.handoffContinue}
          </button>
        </Plane>
      </div>
    );
  }

  return (
    <div className="ad12 completion-ritual mission-shell__completion-ritual">
      <Plane className="completion-ritual__plane">
        <p className="ad12-reading-text completion-ritual__certificate-heading">{ui.certificateHeading}</p>
        <p className="ad12-ui-text">{ui.certificateBlankLabel}</p>
        <button
          type="button"
          className="ad12-ink-button ad12-tappable"
          onClick={() => window.open('/print/centre/', '_blank', 'noopener')}
        >
          {ui.courseHomeKitLabel}
        </button>
        <button type="button" className="ad12-ink-button ad12-tappable" onClick={onDone}>
          {ui.handoffContinue}
        </button>
      </Plane>
    </div>
  );
}
