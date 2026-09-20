import type { Mission } from '../engine/types';
import type { Progress } from '../engine/storage';
import { Ruby } from '../engine/ruby';
import './bank-select.css';

export interface BankSelectUi {
  bankHeading: string;
  bankBackButton: string;
  bankDoneLabel: string;
}

export interface BankSelectProps {
  bankOrder: string[];
  missions: Record<string, Mission>;
  progress: Record<string, Progress>;
  ui: BankSelectUi;
  onSelect: (missionId: string) => void;
  onBack: () => void;
}

/**
 * WO-21 Phase 1: the free-pick list of Bank Digs (AD-04) — "pickable in any order", never a
 * sequence like the Story missions. Plain done/not-done per topic from the active profile's own
 * `progress`, never a score, rank, or percentage (spec's no-scoring-to-the-child rule applies to
 * the Bank exactly as it does to Story missions).
 */
export function BankSelect({ bankOrder, missions, progress, ui, onSelect, onBack }: BankSelectProps) {
  return (
    <div className="bank-select">
      <p className="bank-select__heading">{ui.bankHeading}</p>
      <div className="bank-select__grid">
        {bankOrder.map((id) => {
          const mission = missions[id];
          if (!mission) return null;
          const done = progress[mission.id]?.done ?? false;
          return (
            <button
              key={mission.id}
              type="button"
              className="bank-select__topic"
              onClick={() => onSelect(mission.id)}
            >
              <span className="bank-select__title"><Ruby text={mission.title} /></span>
              {done && <span className="bank-select__done">{ui.bankDoneLabel}</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className="bank-select__back" onClick={onBack}>
        {ui.bankBackButton}
      </button>
    </div>
  );
}
