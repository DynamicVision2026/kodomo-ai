import { useState } from 'react';
import type { Mission, ModuleUiStrings } from '../engine/types';
import { load, save, MAX_PROFILES, type AppState, type Profile } from '../engine/storage';
import { hasAccess } from '../engine/entitlements';
import { track } from '../engine/analytics';
import { ProfilePicker } from './ProfilePicker';
import { SlotAssembly } from '../templates/slot-assembly';
import { Dig } from '../templates/dig';
import { Handoff } from '../templates/handoff';
import { Ruby } from '../engine/ruby';
import './mission-shell.css';

export interface MissionShellProps {
  moduleId: string;
  freeMissionIds: string[];
  mission: Mission;
  ui: ModuleUiStrings;
}

type Screen =
  | { kind: 'profile' }
  | { kind: 'locked' }
  | { kind: 'coop' }
  | { kind: 'phase'; index: number }
  | { kind: 'tip' }
  | { kind: 'teachback' }
  | { kind: 'ouchi' }
  | { kind: 'handoff' }
  | { kind: 'parent' };

/**
 * Phase sequencer + profiles. Spec v0.5 §7 (Task 5): slot-assembly -> dig -> wrapper screens
 * (きょうのコツ / teach-back / おうちトーク) -> handoff -> parent screen. hasAccess is
 * consulted before every mission — engine content, not module-specific, so this component
 * never imports a module by name; the caller (src/main.tsx) supplies the module and mission.
 *
 * Storage-blocked resilience: load()/save() already degrade to an in-memory default on
 * failure (src/engine/storage.ts), so this component just uses them normally — the current
 * session keeps working either way, it just won't be remembered after a reload.
 */
export function MissionShell({ moduleId, freeMissionIds, mission, ui }: MissionShellProps) {
  const [appState, setAppState] = useState<AppState>(() => load());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [solo, setSolo] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: 'profile' });

  function persist(next: AppState) {
    setAppState(next);
    save(next);
  }

  function afterProfileChosen(p: Profile) {
    setProfile(p);
    if (!hasAccess(appState.entitlements, moduleId, mission.id, freeMissionIds)) {
      setScreen({ kind: 'locked' });
      return;
    }
    setScreen({ kind: 'coop' });
  }

  function createProfile(p: Profile) {
    if (appState.profiles.length >= MAX_PROFILES) return;
    persist({ ...appState, profiles: [...appState.profiles, p] });
    afterProfileChosen(p);
  }

  function chooseCoop(isCoop: boolean) {
    setSolo(!isCoop);
    track('coop_selected', { coop: isCoop });
    track('m1_start');
    setScreen({ kind: 'phase', index: 0 });
  }

  function markDone() {
    if (!profile) return;
    const prior = profile.progress[mission.id];
    const nextProfile: Profile = {
      ...profile,
      progress: { ...profile.progress, [mission.id]: { done: true, stamps: prior?.stamps ?? 0, coop: !solo } },
    };
    setProfile(nextProfile);
    persist({ ...appState, profiles: appState.profiles.map((p) => (p.id === nextProfile.id ? nextProfile : p)) });
    track('m1_complete');
  }

  function addStamp() {
    if (!profile) return;
    const prior = profile.progress[mission.id];
    const nextProfile: Profile = {
      ...profile,
      progress: { ...profile.progress, [mission.id]: { done: prior?.done ?? false, stamps: (prior?.stamps ?? 0) + 1, coop: !solo } },
    };
    setProfile(nextProfile);
    persist({ ...appState, profiles: appState.profiles.map((p) => (p.id === nextProfile.id ? nextProfile : p)) });
  }

  function completePhase() {
    const nextIndex = (screen.kind === 'phase' ? screen.index : 0) + 1;
    if (nextIndex >= mission.phases.length) {
      markDone();
      setScreen({ kind: 'tip' });
    } else {
      setScreen({ kind: 'phase', index: nextIndex });
    }
  }

  if (screen.kind === 'profile') {
    return (
      <ProfilePicker
        profiles={appState.profiles}
        ui={ui}
        onSelect={afterProfileChosen}
        onCreate={createProfile}
      />
    );
  }

  if (screen.kind === 'locked') {
    return (
      <p className="mission-shell__locked">
        <Ruby text={ui.lockedMessage} />
      </p>
    );
  }

  if (screen.kind === 'coop') {
    return (
      <div className="mission-shell__coop">
        <p className="mission-shell__coop-question">
          <Ruby text={ui.coopQuestion} />
        </p>
        <div className="mission-shell__coop-choices">
          <button type="button" onClick={() => chooseCoop(true)}>
            {ui.coopYes}
          </button>
          <button type="button" onClick={() => chooseCoop(false)}>
            {ui.coopSolo}
          </button>
        </div>
      </div>
    );
  }

  if (screen.kind === 'phase') {
    const phase = mission.phases[screen.index]!;
    if (phase.template === 'slot-assembly') {
      return <SlotAssembly phase={phase} ui={ui} solo={solo} onComplete={completePhase} />;
    }
    return <Dig phase={phase} ui={ui} solo={solo} onComplete={completePhase} />;
  }

  if (screen.kind === 'tip') {
    return (
      <div className="mission-shell__wrapper">
        <p><Ruby text={mission.tip} /></p>
        <button type="button" onClick={() => setScreen({ kind: 'teachback' })}>
          {ui.handoffContinue}
        </button>
      </div>
    );
  }

  if (screen.kind === 'teachback') {
    return (
      <div className="mission-shell__wrapper">
        <p><Ruby text={mission.teachBack} /></p>
        <button
          type="button"
          onClick={() => {
            addStamp();
            track('teachback_done');
            setScreen({ kind: 'ouchi' });
          }}
        >
          {ui.handoffContinue}
        </button>
        <button
          type="button"
          className="mission-shell__skip"
          onClick={() => {
            track('teachback_skipped');
            setScreen({ kind: 'ouchi' });
          }}
        >
          {ui.teachbackSkip}
        </button>
      </div>
    );
  }

  if (screen.kind === 'ouchi') {
    return (
      <div className="mission-shell__wrapper">
        <p><Ruby text={mission.ouchiTalk} /></p>
        <button type="button" onClick={() => setScreen({ kind: 'handoff' })}>
          {ui.handoffContinue}
        </button>
      </div>
    );
  }

  if (screen.kind === 'handoff') {
    const toParent = () => {
      track('parent_screen_view');
      setScreen({ kind: 'parent' });
    };
    return (
      <Handoff
        prompt={ui.handoffPrompt}
        continueLabel={ui.handoffContinue}
        skipLabel={ui.handoffSkip}
        onContinue={toParent}
        onSkip={toParent}
      />
    );
  }

  // screen.kind === 'parent'. Structural placeholder only — actual parent-voice kit/price/
  // guarantee copy is Task 7/8's, and needs the legal wording check (spec v0.5 §16) first.
  return (
    <div className="mission-shell__parent">
      <p className="mission-shell__parent-heading">{ui.parentScreenHeading}</p>
    </div>
  );
}
