import { useState } from 'react';
import type { Mission } from '../engine/types';
import type { Progress } from '../engine/storage';
import { bankState } from './progression';
import { Ruby } from '../engine/ruby';
import './bank-select.css';

export interface BankSelectUi {
  bankHeading: string;
  bankBackButton: string;
  bankDoneLabel: string;
  /** WO-26 §7: shown right after a not-yet-unlocked Bank Dig is tapped. */
  bankLockedMessage: string;
}

export interface BankSelectProps {
  bankOrder: string[];
  missions: Record<string, Mission>;
  progress: Record<string, Progress>;
  /** WO-26 §5: the Story spine, in order — the source of truth `bankState` derives each Bank
   *  Dig's own unlock point from. Never a second, hand-authored schedule. */
  storyMissionsInOrder: Mission[];
  ui: BankSelectUi;
  onSelect: (missionId: string) => void;
  onBack: () => void;
}

/**
 * WO-21 Phase 1: the free-pick list of Bank Digs (AD-04) — "pickable in any order" once
 * unlocked, never a sequence like the Story missions. Plain done/not-done per topic from the
 * active profile's own `progress`, never a score, rank, or percentage (spec's no-scoring-to-
 * the-child rule applies to the Bank exactly as it does to Story missions).
 *
 * WO-26 §5/§7: a Bank Dig LOCKED by the derived unlock schedule is still shown (never hidden —
 * "must not look broken"), just dimmed and unenterable; tapping it shows a short diegetic
 * explanation instead of entering.
 */
export function BankSelect({ bankOrder, missions, progress, storyMissionsInOrder, ui, onSelect, onBack }: BankSelectProps) {
  const [lockedTapId, setLockedTapId] = useState<string | null>(null);

  function tapTopic(id: string, state: ReturnType<typeof bankState>) {
    if (state === 'locked') {
      setLockedTapId(id);
      return;
    }
    setLockedTapId(null);
    onSelect(id);
  }

  return (
    <div className="bank-select">
      <p className="bank-select__heading">{ui.bankHeading}</p>
      <div className="bank-select__grid">
        {bankOrder.map((id) => {
          const mission = missions[id];
          if (!mission) return null;
          const state = bankState(mission, storyMissionsInOrder, progress);
          const done = state === 'completed';
          const locked = state === 'locked';
          return (
            <div key={mission.id} className="bank-select__cell">
              <button
                type="button"
                className={`bank-select__topic${locked ? ' is-locked' : ''}`}
                onClick={() => tapTopic(mission.id, state)}
              >
                <span className="bank-select__topic-icon" aria-hidden="true">🕳️</span>
                <span className="bank-select__title"><Ruby text={mission.title} /></span>
                {done && <span className="bank-select__done">{ui.bankDoneLabel}</span>}
              </button>
              {locked && lockedTapId === mission.id && (
                <p className="bank-select__locked-note"><Ruby text={ui.bankLockedMessage} /></p>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="bank-select__back" onClick={onBack}>
        {ui.bankBackButton}
      </button>
    </div>
  );
}
