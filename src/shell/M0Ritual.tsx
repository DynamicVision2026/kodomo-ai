import type { ModuleUiStrings } from '../engine/types';
import { Ruby } from '../engine/ruby';

export interface M0RitualProps {
  ui: ModuleUiStrings;
  onSeal: () => void;
}

/**
 * Architect-resolved completion-ritual behaviour #1: M0, the Day-1 baseline-question envelope
 * (ひみつふうとう). Child writes one question on paper; parent writes their own on the back; no
 * feedback; nothing captured by the app — no text input anywhere in this component
 * (gate:no-free-text scans this whole directory); one tap (the existing `sealM0`/`m0Action`
 * mechanism, unchanged) confirms the sheet is sealed.
 *
 * Content-only (no outer wrapper div) so both of its callers can place it in their own layout:
 * src/shell/MissionShell.tsx's dedicated first-entry 'm0-ritual' screen (full-height parent
 * register) and the same file's pre-existing parent-screen M0 fallback (compact, embedded in the
 * scrollable parent dashboard). Every string below is the Architect's own canonical wording,
 * reused verbatim — see src/engine/types.ts's own doc comments on each field.
 */
export function M0Ritual({ ui, onSeal }: M0RitualProps) {
  return (
    <>
      <p className="mission-shell__m0-child-prompt"><Ruby text={ui.m0ChildPrompt ?? ''} /></p>
      <div className="mission-shell__m0-parent-instruction">
        <p>{ui.m0ParentIntro}</p>
        <p>{ui.m0ParentStep1}</p>
        <p>{ui.m0ParentStep2}</p>
        <p>{ui.m0ParentStep3}</p>
        <p>{ui.m0ParentStep4}</p>
        <p>{ui.m0ParentForward}</p>
      </div>
      <button type="button" onClick={onSeal}>{ui.m0Action}</button>
    </>
  );
}
