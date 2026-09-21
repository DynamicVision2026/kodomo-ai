import { useState } from 'react';
import type { Mission, ModuleUiStrings } from '../engine/types';
import { load, save, MAX_PROFILES, type AppState, type Profile } from '../engine/storage';
import { hasAccess } from '../engine/entitlements';
import { applyMoveRendered, applyAptUse, applyBlindCommit, applyOutsideUse } from '../engine/scaffold';
import {
  evaluateM1, evaluateM3, evaluateM4, evaluateM5, addM2ProxyMission, applyM2Confirmed,
  applyM0Sealed, recordFirstThreeChain, recordFirstBlindCommit, recordOutsideUse,
} from '../engine/milestones';
import { track } from '../engine/analytics';
import { ProfilePicker } from './ProfilePicker';
import { pickNextMission } from './missionLibrary';
import { Toolbox } from './Toolbox';
import { BankSelect } from './BankSelect';
import { CourseHome } from './CourseHome';
import { MissionComplete } from './MissionComplete';
import { SlotAssembly } from '../templates/slot-assembly';
import { Dig, type UseEvidence, type BlindSelfReportEvidence, type DigResult } from '../templates/dig';
import { Handoff } from '../templates/handoff';
import { Ruby } from '../engine/ruby';
import { MissionStage } from '../stage/MissionStage';
import { SpeechBubble } from '../stage/SpeechBubble';
import './mission-shell.css';

/** Every mission a module ships (any stage) + the order `pickNextMission` walks. Optional: a
 *  caller with only one mission (today's reality for most modules) can omit this and `mission`
 *  is used as-is, exactly as before Sprint 1-A. */
export interface MissionLibrary {
  missionOrder: string[];
  missions: Record<string, Mission>;
}

/** WO-21 Phase 1: the Bank Digs (AD-04) — a free-pick list, never a sequence `pickNextMission`
 *  walks. `bankOrder` is display order only (spec's "pickable in any order" is about the
 *  family's choice, not an enforced progression). */
export interface BankLibrary {
  bankOrder: string[];
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
  /** WO-21 Phase 1: when supplied, the parent screen gains a button into a Bank-selection
   *  screen reusing this same shell's own Dig-playing machinery — no second engine. Omitted
   *  entirely (as before) for a module with no Bank content. */
  bankLibrary?: BankLibrary;
  /** WO-05: module.json's own `followMoves`/`cardTypes`, for the parent screen's Toolbox — never
   *  a second hard-coded move list or label source. Omit for a module with no follow moves. */
  followMoves?: string[];
  cardTypes?: Record<string, { label: string }>;
  /** WO-23 (AD-06 §8): a build-time-only QA/family-test opt-in, isolated from real entitlement
   *  logic — `hasAccess()` (src/engine/entitlements.ts) is never touched or bypassed at the
   *  engine level; this only skips the two call sites in this component that would otherwise
   *  call it, so all 8 Story Missions and all 12 Bank Digs can be reached without a real
   *  purchase. Every real production build passes `false`/omits this prop entirely — see
   *  src/main.tsx's own `VITE_FAMILY_TEST_MODE` wiring and docs/family-test-mode.md. */
  familyTestMode?: boolean;
  /** WO-24 (AD-07 v0.7a prototype): the ONE mission id, if any, that should play through the new
   *  continuous MissionStage instead of the original screen-by-screen SlotAssembly/Dig/wrapper
   *  sequence. Deliberately an explicit id supplied by the caller, not inferred from content —
   *  the archived pre-chanto fixture ("bread", module m1's own topics dir) still carries the
   *  SAME id Mission 1-1 now uses ("m1-s2-1-1"), so matching on id alone without an opt-in
   *  would wrongly catch it too. src/main.tsx passes its own real chanto mission's id; every
   *  other caller (including every existing test) omits this prop and gets the original
   *  behaviour unchanged. */
  continuousStageMissionId?: string;
}

type Screen =
  | { kind: 'profile' }
  | { kind: 'locked' }
  | { kind: 'course-home' }
  | { kind: 'coop' }
  | { kind: 'phase'; index: number }
  /** WO-24 (AD-07): Mission 1's own continuous scene — replaces the 'phase'/'tip' sequence, only
   *  when `continuousStageMissionId` matches the active mission. */
  | { kind: 'stage' }
  | { kind: 'tip' }
  | { kind: 'teachback' }
  | { kind: 'ouchi' }
  | { kind: 'perspective' }
  | { kind: 'handoff' }
  | { kind: 'parent' }
  | { kind: 'complete' }
  | { kind: 'bank-select' };

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
  moduleId, freeMissionIds, mission: defaultMission, ui, missionLibrary, bankLibrary,
  followMoves = [], cardTypes = {}, familyTestMode = false, continuousStageMissionId,
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

  /** WO-23 (AD-06 §8): the one place both real production entitlement gating and the isolated
   *  family-test bypass meet. `hasAccess()` itself is never touched — `familyTestMode` only
   *  skips calling it here, and only when a caller explicitly opted this whole shell into that
   *  mode (never true in a real production build). */
  function enterMission(m: Mission) {
    setMission(m);
    if (!familyTestMode && !hasAccess(appState.entitlements, moduleId, m.id, freeMissionIds)) {
      setScreen({ kind: 'locked' });
      return;
    }
    setScreen({ kind: 'coop' });
  }

  /** WO-23 WP-4 (AD-06 D1): every journey — new profile or returning — lands on Course Home
   *  first, never straight into a mission. `mission` state is still resolved here (Course
   *  Home's own "current depth" highlight and its primary continue action both read it), just
   *  not entered automatically; the actual entitlement check only runs once the family taps
   *  something (AD-06 D2 S02: "Undug depths shown dimmed, never a dead end"). */
  function afterProfileChosen(p: Profile) {
    const resolved = resolveMission(p);
    setMission(resolved);
    setProfile(p);
    setScreen({ kind: 'course-home' });
  }

  /** Re-resolves the active profile's current mission and returns to Course Home — used both
   *  for the initial entry and for every "back to the map" action afterward, since completing a
   *  mission changes which one is now current. */
  function goToCourseHome() {
    setProfile((prev) => {
      if (prev) setMission(resolveMission(prev));
      return prev;
    });
    setScreen({ kind: 'course-home' });
  }

  /** Course Home's own depth taps and its primary "continue" action both resolve through here —
   *  a depth ahead of the current one is exactly as reachable as the current one; the ONLY thing
   *  that can stop it is the same real entitlement check every mission has always gone through. */
  function selectStoryMission(missionId: string) {
    const picked = missionLibrary?.missions[missionId];
    if (picked) enterMission(picked);
  }

  /** WO-21 Phase 1: a family picked a specific Bank Dig from the free-pick list. Reuses the
   *  exact same entitlement check and coop-question entry point every Story mission already
   *  goes through — a Bank Dig is not a second, differently-gated kind of content. */
  function selectBankMission(missionId: string) {
    const picked = bankLibrary?.missions[missionId];
    if (picked) enterMission(picked);
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
    setScreen(mission.id === continuousStageMissionId ? { kind: 'stage' } : { kind: 'phase', index: 0 });
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

  /** WO-14: M2b — the authoritative trigger for milestones.M2. Fires only from the parent's own
   *  explicit tap on the parent screen, confirming from their own observation that the child
   *  independently said why the robot's first answer wasn't enough. This is a parent attestation,
   *  not something the software measures or verifies itself — the button's own label says so.
   *  M2a (gapNamed, above) is system-observable proxy evidence only and never reaches this
   *  function or milestones.M2 by any other path; reuses the existing applyM2Confirmed seam
   *  (src/engine/milestones.ts) unchanged — monotonic and idempotent by construction, same as
   *  every other milestone here. */
  function confirmM2b() {
    persistProfile((current) => ({
      ...current,
      milestones: applyM2Confirmed(current.milestones ?? {}, Date.now()),
    }));
  }

  /** WO-19: M0 — the Day-1 envelope moment. Fires only from the parent screen's own explicit
   *  "seal it" tap, once, per profile — never inferred from profile creation or play. Monotonic
   *  via applyM0Sealed, same as every other milestone here. */
  function sealM0() {
    track('m0_sealed');
    persistProfile((current) => ({
      ...current,
      milestones: applyM0Sealed(current.milestones ?? {}, Date.now()),
    }));
  }

  /** WO-19: M5 — そとで つかった. Fires only from the parent screen's own explicit per-move
   *  recording action: the parent identifies WHICH existing move they observed being used
   *  outside an authored mission, never whether it was "correct". Advances that move's scaffold
   *  rung to sotode (applyOutsideUse), re-evaluates M5 from the resulting moveProgress (same
   *  derived pattern as M1/evaluateM1), and records the first_outside_use memory moment. */
  function logOutsideUse(move: string) {
    track('outside_use', { move });
    persistProfile((current) => {
      const moveProgress = applyOutsideUse(current.moveProgress ?? {}, move);
      const now = Date.now();
      return {
        ...current,
        moveProgress,
        milestones: evaluateM5(current.milestones ?? {}, moveProgress, now),
        memories: recordOutsideUse(current.memories ?? {}, now),
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

  /** WO-24 (AD-07): MissionStage's own completion — fires once ROOT and 今日のコツ have both
   *  been read inside the continuous scene, the same moment `completePhase(digResult)` +
   *  advancing past the old 'tip' screen used to fire together. Marks the mission done exactly
   *  as before; then, AD-07 §4D ("solo mode skips this sequence completely") — solo play goes
   *  straight to the parent screen, co-play still walks the existing shared teach-back/おうちト
   *  ーク/handoff screens unchanged (WO-24 §7's own sanctioned Child<->Parent hard transition). */
  function stageCompleted(digResult: DigResult) {
    digPhaseCompleted(digResult);
    markDone();
    setScreen(solo ? { kind: 'parent' } : { kind: 'teachback' });
  }

  /** Mission Complete's own primary action — resolves the active profile's now-updated next
   *  mission (the one just finished no longer counts) and enters it directly, the same way
   *  Course Home's own depth taps do. */
  function goToNextMission() {
    if (!profile) return;
    const resolved = resolveMission(profile);
    enterMission(resolved);
  }

  /** The active profile's own next-undone mission, resolved fresh on every render Mission
   *  Complete needs it for — never stale, since `progress` just changed. `null` (not the
   *  fallback default mission) means the whole course is genuinely done. */
  function nextUndoneMission(): Mission | null {
    if (!profile || !missionLibrary) return null;
    const pickedId = pickNextMission(missionLibrary.missionOrder, missionLibrary.missions, profile);
    return (pickedId && missionLibrary.missions[pickedId]) || null;
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
    // WO-23 (AD-06 RC-1): "locked state is a dead end" — the one thing missing here was any way
    // back at all. The lock/entitlement decision itself is unchanged (hasAccess, real).
    return (
      <div className="mission-shell__locked">
        <p><Ruby text={ui.lockedMessage} /></p>
        <button type="button" onClick={goToCourseHome}>{ui.completeBackToMapLabel}</button>
      </div>
    );
  }

  if (screen.kind === 'course-home' && profile) {
    return (
      <CourseHome
        ui={ui}
        missionOrder={missionLibrary?.missionOrder ?? [mission.id]}
        missions={missionLibrary?.missions ?? { [mission.id]: mission }}
        progress={profile.progress}
        currentMissionId={mission.id}
        moveProgress={profile.moveProgress ?? {}}
        followMoves={followMoves}
        cardTypes={cardTypes}
        hasBank={!!bankLibrary}
        onContinue={() => enterMission(mission)}
        onSelectMission={selectStoryMission}
        onOpenBank={() => setScreen({ kind: 'bank-select' })}
        onOpenParent={() => setScreen({ kind: 'parent' })}
        onOpenKit={() => window.open('/print/kit/', '_blank', 'noopener')}
      />
    );
  }

  if (screen.kind === 'bank-select' && bankLibrary) {
    return (
      <BankSelect
        bankOrder={bankLibrary.bankOrder}
        missions={bankLibrary.missions}
        progress={profile?.progress ?? {}}
        ui={ui}
        onSelect={selectBankMission}
        onBack={goToCourseHome}
      />
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

  if (screen.kind === 'stage') {
    return (
      <MissionStage
        mission={mission}
        ui={ui}
        solo={solo}
        moveProgress={profile?.moveProgress ?? {}}
        onMoveRendered={moveRendered}
        onUse={moveUsed}
        onBlindCommit={blindCommitted}
        onBlindSelfReport={selfReported}
        onGapNamed={gapNamed}
        onComplete={stageCompleted}
      />
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
    const advance = () => {
      addStamp();
      track('teachback_done');
      setScreen({ kind: 'ouchi' });
    };
    // WO-24 (AD-07 §4A よむ): Mission 1 only — the dialogue bubble itself is the interaction
    // target, no つづける/skip button pair. Every other mission keeps the original two-button
    // wrapper screen below, completely unchanged.
    if (mission.id === continuousStageMissionId) {
      return (
        <div className="mission-shell__wrapper">
          <SpeechBubble text={mission.teachBack} onAdvance={advance} />
        </div>
      );
    }
    return (
      <div className="mission-shell__wrapper">
        <p><Ruby text={mission.teachBack} /></p>
        <button type="button" onClick={advance}>
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
    const advance = () => setScreen({ kind: mission.perspective ? 'perspective' : 'handoff' });
    if (mission.id === continuousStageMissionId) {
      return (
        <div className="mission-shell__wrapper">
          <SpeechBubble text={mission.ouchiTalk} onAdvance={advance} />
        </div>
      );
    }
    return (
      <div className="mission-shell__wrapper">
        <p><Ruby text={mission.ouchiTalk} /></p>
        <button type="button" onClick={advance}>
          {ui.handoffContinue}
        </button>
      </div>
    );
  }

  // WO-19 Phase 3C: the perspective-shift moment, shown only when this mission declares one.
  // Reuses the exact tip/teachBack/おうちトーク wrapper-screen idiom — no new architecture.
  if (screen.kind === 'perspective' && mission.perspective) {
    return (
      <div className="mission-shell__wrapper">
        <p className="mission-shell__perspective-voice">{mission.perspective.voice}</p>
        <p><Ruby text={mission.perspective.text} /></p>
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
    // WO-24 (AD-07 §4D わたす): Mission 1 only — "child sees only [the prompt] and one action."
    // Solo already never reaches this screen for Mission 1 (stageCompleted routes solo straight
    // to 'parent'), so there is nothing to skip here; every other mission keeps the original
    // generic Handoff (prompt + continue + skip) below, completely unchanged.
    if (mission.id === continuousStageMissionId) {
      return (
        <Handoff
          prompt={ui.stageHandoffPrompt}
          continueLabel={ui.stageHandoffGiven}
          onContinue={toParent}
        />
      );
    }
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

  // screen.kind === 'parent' (or 'complete', handled just after). Parent-voice kit/price/
  // guarantee copy is Task 7/8's own, still pending the legal wording check (spec v0.5 §16) —
  // the Toolbox (WO-05) and the M2b confirmation (WO-14) are this screen's own, separate
  // concerns: read-only growth over the active profile's own moveProgress, and one binary
  // parent attestation over its milestones.
  if (screen.kind === 'complete') {
    // WO-23 §7 (AD-06 D3 COMPLETE): the real completion state the audit's "completion lacks
    // navigation" finding names directly — reached from the parent screen's own final action,
    // never a replacement for it.
    return (
      <MissionComplete
        ui={ui}
        mission={mission}
        cardTypes={cardTypes}
        nextMission={nextUndoneMission()}
        onNext={goToNextMission}
        onBackToMap={goToCourseHome}
        onTryOutside={() => setScreen({ kind: 'parent' })}
      />
    );
  }

  const m2Achieved = profile?.milestones?.M2?.achieved ?? false;
  const m0Achieved = profile?.milestones?.M0?.achieved ?? false;
  return (
    <div className="mission-shell__parent">
      <p className="mission-shell__parent-heading">{ui.parentScreenHeading}</p>
      <Toolbox
        followMoves={followMoves}
        cardTypes={cardTypes}
        moveProgress={profile?.moveProgress ?? {}}
        heading={ui.toolboxHeading}
      />
      {m0Achieved ? (
        <p className="mission-shell__m0-sealed">{ui.m0SealedMessage}</p>
      ) : (
        <div className="mission-shell__m0">
          <p>{ui.m0Prompt}</p>
          <button type="button" onClick={sealM0}>{ui.m0Action}</button>
        </div>
      )}
      {m2Achieved ? (
        <p className="mission-shell__m2-confirmed">{ui.m2ConfirmedMessage}</p>
      ) : (
        <div className="mission-shell__m2">
          <p>{ui.m2ConfirmPrompt}</p>
          <button type="button" onClick={confirmM2b}>{ui.m2ConfirmAction}</button>
        </div>
      )}
      {followMoves.length > 0 && (
        <div className="mission-shell__m5">
          <p>{ui.m5Prompt}</p>
          <div className="mission-shell__m5-moves">
            {followMoves.map((move) => (
              <button key={move} type="button" onClick={() => logOutsideUse(move)}>
                {cardTypes[move]?.label ?? move}
              </button>
            ))}
          </div>
        </div>
      )}
      {bankLibrary && (
        <div className="mission-shell__bank-hub">
          <button type="button" onClick={() => setScreen({ kind: 'bank-select' })}>
            {ui.bankHubButton}
          </button>
        </div>
      )}
      {/* WO-23 §7 (AD-06 RC-1): the one thing this screen never had — a way onward. Every prior
         action on this screen (M0/M2b/M5/Bank) stays exactly as it was; this just adds the
         missing next step, so a family never needs to reload /play/ to continue. */}
      {/* WO-24 (AD-07 §4D): Mission 1's own ui.stageReturnToChild copy — the explicit return-
         to-child-register action AD-07 names. Every other mission keeps the generic label. */}
      <button type="button" className="mission-shell__to-complete" onClick={() => setScreen({ kind: 'complete' })}>
        {mission.id === continuousStageMissionId ? ui.stageReturnToChild : ui.handoffContinue}
      </button>
    </div>
  );
}
