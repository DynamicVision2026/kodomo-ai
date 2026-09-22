import { Ruby } from '../engine/ruby';
import './primitives.css';
import './teach-back-panel.css';

export interface TeachBackPanelProps {
  teachBack: string;
  ouchiTalk: string;
  m2ConfirmPrompt: string;
  m2ConfirmAction: string;
  m2Confirmed: boolean;
  m2ConfirmedMessage: string;
  onConfirm?: () => void;
}

/**
 * AD-12 §4 state 10 / F7: "Parent actions (M2b はい/まだ, the handoff, the Lab) use ink, never
 * yellow." This panel's one action button is styled in ink-on-white — no accent colour appears
 * anywhere in this component, structurally (there is no yellow token referenced in its CSS at
 * all), so it cannot regress into using the child's own accent by a later edit.
 */
export function TeachBackPanel({
  teachBack, ouchiTalk, m2ConfirmPrompt, m2ConfirmAction, m2Confirmed, m2ConfirmedMessage, onConfirm,
}: TeachBackPanelProps) {
  return (
    <div className="ad12-teach-back-panel">
      <p className="ad12-reading-text"><Ruby text={teachBack} /></p>
      <p className="ad12-ui-text ad12-teach-back-panel__ouchi"><Ruby text={ouchiTalk} /></p>
      {m2Confirmed ? (
        <p className="ad12-ui-text">{m2ConfirmedMessage}</p>
      ) : (
        <>
          <p className="ad12-ui-text">{m2ConfirmPrompt}</p>
          <button type="button" className="ad12-ink-button ad12-tappable" onClick={onConfirm}>
            {m2ConfirmAction}
          </button>
        </>
      )}
    </div>
  );
}
