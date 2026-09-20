import { useState } from 'react';
import type { Mission, ModuleUiStrings } from '../engine/types';
import { load, save, MAX_PROFILES, type AppState, type Profile } from '../engine/storage';
import { hasAccess } from '../engine/entitlements';
import { applyMoveRendered, applyAptUse, applyBlindCommit } from '../engine/scaffold';
import {
  evaluateM1, evaluateM3, evaluateM4, addM2ProxyMission,
  recordFirstThreeChain, recordFirstBlindCommit,
} from '../engine/milestones';
import { track } from '../engine/analytics';
import { ProfilePicker } from './ProfilePicker';
import { pickNextMission } from './missionLibrary';
import { Toolbox } from './Toolbox';
import { SlotAssembly } from '../templates/slot-assembly';
import { Dig, type UseEvidence, type BlindSelfReportEvidence, type DigResult } from '../templates/dig';
import { Handoff } from '../templates/handoff';
import { Ruby } from '../engine/ruby';
import './mission-shell.css';

/** Every mission a module ships (any stage) + the order `pickNextMission` walks. Optional: a
 *  caller with only one mission (today's reality for most modules) can omit this and `mission`
 *  is used as-is, exactly as before Sprint 1-A. */
export interface MissionLibrary {
  missionOrder: string[];
  missions: Record<string, Mission>;
}

export interface MissionShellProps {
  moduleId: string;
  freeMissionIds: string[];
  /** Default/fallback mission — used as-is when `missionLibrary` is absent, or when it has no
   *  undone mission at the chosen profile's stage. */
  mission: Mission;
  ui: ModuleUiStrings;
  missionLibrary?: MissionLibrary;
  /** WO-05: module.json's own `followMoves`/`cardTypes`, for the parent screen's Toolbox — never
   *  a second hard-coded move list or label source. Omit for a module with no follow moves. */
  followMoves?: string[];
  cardTypes?: Record<string, { label: string }>;
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
export function MissionShell({
  moduleId, freeMissionIds, mission: defaultMission, ui, missionLibrary,
  followMoves = [], cardTypes = {},
}: MissionShellProps) {
  const [appState, setAppState] = useState<AppState>(() => load());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [solo, setSolo] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: 'profile' });
  const [mission, setMission] = useState<Mission>(defaultMission);

  function persist(next: AppState) {
    setAppState(next);
    save(next);
  }

  /**
   * Common update path for every profile-scoped evidence handler below. Takes an UPDATER, not a
   * precomputed object, and applies it via React's functional setState form on both `profile`
   * and `appState` — necessary because a single Dig event can synchronously trigger more than
   * one of these handlers (e.g. resolving Gap Naming fires both onGapNamed and onMoveRendered),
   * and `profile`/`appState` don't reflect an earlier call's update until the next render. The
   * functional form guarantees each call composes onto the previous one's result instead of a
   * stale closure value, however many handlers fire in the same tick.
   */
  function persistProfile(update: (current: Profile) => Profile) {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = update(prev);
      setAppState((prevAppState) => {
        const nextAppState: AppState = {
          ...prevAppState,
          profiles: prevAppState.profiles.map((p) => (p.id === next.id ? next : p)),
        };
        save(nextAppState);
        return nextAppState;
      });
      return next;
    });
  }

  /** Resolves which mission a just-chosen profile should actually play, via the mission
   *  library when one was supplied — falling back to `defaultMission` otherwise (or if the
   *  library has nothing undone at this profile's stage). Sprint 1-A gap E. */
  function resolveMission(p: Profile): Mission {
    if (!missionLibrary) return defaultMission;
    const pickedId = pickNextMission(missionLibrary.missionOrder, missionLibrary.missions, p);
    return (pickedId && missionLibrary.missions[pickedId]) || defaultMission;
  }

  function afterProfileChosen(p: Profile) {
    const resolved = resolveMission(p);
    setMission(resolved);
    setProfile(p);
    if (!hasAccess(appState.entitlements, moduleId, resolved.id, freeMissionIds)) {
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
    persistProfile((current) => {
      const prior = current.progress[mission.id];
      return {
        ...current,
        progress: { ...current.progress, [mission.id]: { done: true, stamps: prior?.stamps ?? 0, coop: !solo } },
      };
    });
    track('m1_complete');
  }

  function addStamp() {
    persistProfile((current) => {
      const prior = current.progress[mission.id];
      return {
        ...current,
        progress: { ...current.progress, [mission.id]: { done: prior?.done ?? false, stamps: (prior?.stamps ?? 0) + 1, coop: !solo } },
      };
    });
  }

  /** WO-04: a move's follow-up card was shown (みはっけん -> もらった, once). WO-08: also
   *  re-evaluates M1 (どうぐが 手に入った) from the resulting moveProgress — purely derived,
   *  no separate evidence needed. */
  function moveRendered(move: string) {
    persistProfile((current) => {
      const moveProgress = applyMoveRendered(current.moveProgress ?? {}, move);
      return { ...current, moveProgress, milestones: evaluateM1(current.milestones ?? {}, moveProgress, Date.now()) };
    });
  }

  /** WO-04 (Correction 01): a follow-up card was played — every tag, including sideways/repeat/
   *  offtopic, which establish play order (so a later deepen at the same layer correctly fails
   *  apt_use) but carry no move of their own. Only evidence with an attributable move is
   *  reported here or can advance that move's scaffold progression — no move identity is
   *  invented for the rest. WO-08: apt_use also re-evaluates M1 from the resulting moveProgress. */
  function moveUsed(evidence: UseEvidence) {
    if (!evidence.move || !evidence.domain) return;
    const props = {
      move: evidence.move, domain: evidence.domain, missionId: evidence.missionId,
      layerIndex: evidence.layerIndex, timestamp: evidence.timestamp,
    };
    track('use', props);
    if (!evidence.aptUse) return;
    track('apt_use', props);
    const move = evidence.move;
    const domain = evidence.domain;
    persistProfile((current) => {
      const moveProgress = applyAptUse(current.moveProgress ?? {}, move, domain);
      return { ...current, moveProgress, milestones: evaluateM1(current.milestones ?? {}, moveProgress, Date.now()) };
    });
  }

  /** WO-07: the child committed 「いえた」 for `move` while its hand was still hidden. Means only
   *  that the commitment happened before the reveal — never a judgment of what was said.
   *  applyBlindCommit itself guards against advancing a move that isn't already at tsukaeru, so
   *  this can never affect any other move's progression.
   *
   *  WO-08: this same event is M4's (カードなしで きけた) foundation and the first-without-card
   *  memory moment — both fully authoritative from blind_commit alone, no semantic evaluation of
   *  what the child said. Recorded here, not on merely rendering Blind-first. */
  function blindCommitted(move: string) {
    track('blind_commit', { move, missionId: mission.id });
    const missionId = mission.id;
    persistProfile((current) => {
      const now = Date.now();
      return {
        ...current,
        moveProgress: applyBlindCommit(current.moveProgress ?? {}, move),
        milestones: evaluateM4(current.milestones ?? {}, now),
        memories: recordFirstBlindCommit(current.memories ?? {}, now, missionId),
      };
    });
  }

  /** WO-07: blind_selfreport — display/reflection evidence only. Tracked for observability;
   *  deliberately never touches moveProgress, milestones or memories, whichever of the three
   *  choices was given (WO-08's non-evaluation rule applies here just as it does to blind_commit
   *  itself). */
  function selfReported(evidence: BlindSelfReportEvidence) {
    track('blind_selfreport', {
      move: evidence.move, missionId: evidence.missionId,
      layerIndex: evidence.layerIndex, classification: evidence.classification,
    });
  }

  /** WO-08: M2a — the system-observable proxy (Critical M2 distinction). Recorded whenever Gap
   *  Naming resolves: the child judged an answer "not enough" and named a gap before the next
   *  follow-up. Accumulates distinct mission ids only; never sets milestones.M2 itself — only an
   *  actual (not-yet-built) parent confirmation can do that. See src/engine/milestones.ts. */
  function gapNamed(evidence: { missionId: string }) {
    persistProfile((current) => ({
      ...current,
      m2Evidence: addM2ProxyMission(current.m2Evidence ?? { proxyMissionIds: [] }, evidence.missionId),
    }));
  }

  /** WO-08: a Dig phase just completed with `layerCount` authored layers — the deterministic
   *  signal for M3 (3れん ホリ) and the first-3-chain memory moment. Bread's shipped mission has
   *  only 2 layers, so this is correctly a no-op for it today; the mechanism itself doesn't wait
   *  on that content. */
  function digPhaseCompleted(result: DigResult) {
    const missionId = mission.id;
    persistProfile((current) => {
      const now = Date.now();
      return {
        ...current,
        milestones: evaluateM3(current.milestones ?? {}, result.layerCount, now),
        memories: result.layerCount >= 3
          ? recordFirstThreeChain(current.memories ?? {}, now, missionId)
          : (current.memories ?? {}),
      };
    });
  }

  function completePhase(digResult?: DigResult) {
    if (digResult) digPhaseCompleted(digResult);
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
        defaultStage={defaultMission.stage}
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
      return <SlotAssembly phase={phase} ui={ui} solo={solo} onComplete={() => completePhase()} />;
    }
    return (
      <Dig
        phase={phase}
        ui={ui}
        solo={solo}
        missionId={mission.id}
        moveProgress={profile?.moveProgress ?? {}}
        onComplete={(result) => completePhase(result)}
        onMoveRendered={moveRendered}
        onUse={moveUsed}
        onBlindCommit={blindCommitted}
        onBlindSelfReport={selfReported}
        onGapNamed={gapNamed}
      />
    );
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

  // screen.kind === 'parent'. Parent-voice kit/price/guarantee copy is Task 7/8's own, still
  // pending the legal wording check (spec v0.5 §16) — the Toolbox (WO-05) is this screen's own,
  // separate concern: a read-only growth surface over the active profile's own moveProgress.
  return (
    <div className="mission-shell__parent">
      <p className="mission-shell__parent-heading">{ui.parentScreenHeading}</p>
      <Toolbox
        followMoves={followMoves}
        cardTypes={cardTypes}
        moveProgress={profile?.moveProgress ?? {}}
        heading={ui.toolboxHeading}
      />
    </div>
  );
}
