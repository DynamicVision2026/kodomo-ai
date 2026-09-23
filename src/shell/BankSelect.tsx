import { useState } from 'react';
import type { Mission } from '../engine/types';
import type { Progress } from '../engine/storage';
import { bankState } from './progression';
import { BankPlane, type BankItem } from '../ad12/BankPlane';
import '../ad12/tokens.css';
import '../ad12/primitives.css';
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
 *
 * AD-12 §4 state 11 (Bank): reuses BankPlane directly. `sectionLocked` is always false here —
 * BankSelect is itself only ever reached once Course Home's own Bank nav button is showing
 * (`hasBank`), so there is no separate "whole section still closed" moment this screen needs to
 * render; each item's own real prerequisite (Story 1-4 floor, then its own rootType/move gate —
 * `bankState`, unchanged) already governs whether it's `available`.
 */
export function BankSelect({ bankOrder, missions, progress, storyMissionsInOrder, ui, onSelect, onBack }: BankSelectProps) {
  const [lockedTapId, setLockedTapId] = useState<string | null>(null);

  const entries = bankOrder
    .map((id) => missions[id])
    .filter((m): m is Mission => !!m)
    .map((mission) => ({
      mission,
      state: bankState(mission, storyMissionsInOrder, progress),
    }));

  const items: BankItem[] = entries.map(({ mission, state }) => ({
    id: mission.id,
    title: mission.title,
    available: state !== 'locked',
    done: state === 'completed',
    doneLabel: ui.bankDoneLabel,
  }));

  function tapTopic(id: string) {
    const entry = entries.find((e) => e.mission.id === id);
    if (entry?.state === 'locked') {
      setLockedTapId(id);
      return;
    }
    setLockedTapId(null);
    onSelect(id);
  }

  return (
    <div className="ad12 bank-select">
      <p className="bank-select__heading">{ui.bankHeading}</p>
      <BankPlane
        sectionLocked={false}
        items={items}
        onSelect={tapTopic}
        tappableWhenUnavailable
        noteForId={lockedTapId ?? undefined}
        note={ui.bankLockedMessage}
      />
      <button type="button" className="bank-select__back" onClick={onBack}>
        {ui.bankBackButton}
      </button>
    </div>
  );
}
