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
  /** WO-24 (AD-07 v0.7a prototype) / WO-26 (Module 1 rollout): the set of mission ids, if any,
   *  that should play through the new continuous MissionStage instead of the original
   *  screen-by-screen SlotAssembly/Dig/wrapper sequence. Deliberately explicit ids supplied by
   *  the caller, not inferred from content — the archived pre-chanto fixture ("bread", module
   *  m1's own topics dir) still carries the SAME id Mission 1-1 now uses ("m1-s2-1-1"), so
   *  matching on id alone without an opt-in would wrongly catch it too. src/main.tsx passes
   *  every real Story Mission's and Bank Dig's own id (WO-26: the golden interaction grammar,
   *  validated on Mission 1, is now the whole module's interaction model); every other caller
   *  (including every existing test that omits this prop) gets the original screen-by-screen
   *  behaviour unchanged. */
  continuousStageMissionIds?: ReadonlySet<string>;
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
  /** WO-24 (AD-07 beat 15): Mission 1's own parent-turn teach-back — reached only from the
   *  Mission-1 co-play 'handoff' screen's own continue action. */
  | { kind: 'stage-teachback' }
  /** WO-27: `afterMission` distinguishes the two genuinely different ways this screen is
   *  reached. `true` — a real mission handoff just finished (`toParent()`/the Mission-1
   *  handoff flow): `mission` is legitimately "what was just played," and the screen's own
   *  final action correctly continues into that mission's own MissionComplete. `false` — the
   *  parent opened this screen independently, any time, via Course Home's own standing
   *  「おうちの方へ」 button (`onOpenParent`): there is no just-finished mission here at all,
   *  `mission` is only Course Home's own CURRENT-highlight (which may be a Story the family
   *  has never even entered), and the final action must return to Course Home directly instead
   *  of fabricating a completion screen for content nobody played. Root cause of the reported
   *  "Story 2 completion screen with no Story 2 play" defect: this screen's final button used
   *  to route to `{ kind: 'complete' }` unconditionally either way. */
  | { kind: 'parent'; afterMission: boolean }
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
  followMoves = [], cardTypes = {}, familyTestMode = false, continuousStageMissionIds,
}: MissionShellProps) {
  const [appState, setAppState] = useState<AppState>(() => load());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [solo, setSolo] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: 'profile' });
  /** WO-25 #6: which of the 'stage-teachback' screen's own two steps (teach-back -> return-to-
   *  child) is showing — kept out of the Screen union itself since neither step is a real hard
   *  navigation target on its own (nothing else ever routes to "just step 2"). */
  const [parentGaveTeachBack, setParentGaveTeachBack] = useState(false);
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
   *  mode (never true in a real production build).
   *
   *  WO-27 root cause: this used to call `setMission(m)` BEFORE the entitlement check, so a
   *  REJECTED entry attempt still permanently overwrote the shared `mission` state to the
   *  blocked target. Any screen reached afterward without its own explicit mission — most
   *  visibly the parent dashboard opened directly from Course Home's own standing button, and
   *  whatever it routes to next (`screen.kind === 'complete'`, which renders MissionComplete for
   *  whatever `mission` currently is, with no check that it was actually just finished) — then
   *  silently inherited that blocked mission's identity. `mission` is now only ever set once
   *  entry is actually authorized, so a locked attempt leaves every other screen's context
   *  exactly as it was. */
  function enterMission(m: Mission) {
    if (!familyTestMode && !hasAccess(appState.entitlements, moduleId, m.id, freeMissionIds)) {
      setScreen({ kind: 'locked' });
      return;
    }
    setMission(m);
    setScreen({ kind: 'coop' });
  }

  /** WO-27: the SAME authorization `enterMission` itself checks, exposed as a pure predicate so
   *  Course Home's own CURRENT display can agree with it instead of computing "current" purely
   *  from sequence (CURRENT => ENTERABLE). */
  function isStoryEntitled(missionId: string): boolean {
    return familyTestMode || hasAccess(appState.entitlements, moduleId, missionId, freeMissionIds);
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
    setScreen(continuousStageMissionIds?.has(mission.id) ? { kind: 'stage' } : { kind: 'phase', index: 0 });
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

  /** WO-24 (AD-07 §D): one verb inside Mission 1's continuous stage completed unprompted —
   *  steps that verb's own guidance use count up by one, persisted on the profile
   *  (Profile.guidance, src/engine/storage.ts). The stage itself re-derives SHOW/NUDGE/FADE/
   *  INDEPENDENT from this count on every render (src/stage/Guidance.tsx's guidanceLevelFor) —
   *  nothing here decides a level, this only ever counts. */
  function guidanceUsed(verb: string) {
    persistProfile((current) => ({
      ...current,
      guidance: { ...current.guidance, [verb]: (current.guidance?.[verb] ?? 0) + 1 },
    }));
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

  // WO-24 (AD-07): MissionStage's own completion — fires once ROOT and the tip beat have both
  // been read inside the continuous scene, the same moment completePhase(digResult) plus
  // advancing past the old tip screen used to fire together. Marks the mission done exactly as
  // before; then, per AD-07 section 4D/beat 14 (solo mode skips this sequence completely) —
  // solo play goes straight to the parent screen; co-play goes straight to the Mission-1-only
  // handoff curtain, tip beat straight into HANDOFF, no separate teach-back/ouchi-talk screens
  // in between (see the stage-teachback screen below for where teach-back moved to).
  // WO-25 #6 (P0): the synthetic-child audit's own finding — a solo child was being dropped
  // into the dense multi-control おうちの方へ dashboard with no explanation. AD-07's own
  // "solo mode skips this sequence completely" meant skip the WHOLE parent sequence, not just
  // the handoff curtain — solo goes straight to the child-facing completion screen instead.
  // The parent screen is never deleted or unreachable: Course Home's own standing おうちの方へ
  // button (unchanged) still opens it any time a parent wants it.
  function stageCompleted(digResult: DigResult) {
    digPhaseCompleted(digResult);
    markDone();
    // WO-26 §14: a mission that declares a perspective-shift moment (e.g. Mission 1-5/minna)
    // still shows it — child-facing, before any solo/coop split — exactly where the original
    // screen-by-screen flow placed it (after おうちトーク, before handoff). Preserved content,
    // not mechanically dropped just because the continuous stage skips the old wrapper screens.
    if (mission.perspective) {
      setScreen({ kind: 'perspective' });
      return;
    }
    setScreen(solo ? { kind: 'complete' } : { kind: 'handoff' });
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
        isStoryEntitled={isStoryEntitled}
        moveProgress={profile.moveProgress ?? {}}
        followMoves={followMoves}
        cardTypes={cardTypes}
        hasBank={!!bankLibrary}
        onContinue={() => enterMission(mission)}
        onSelectMission={selectStoryMission}
        onOpenBank={() => setScreen({ kind: 'bank-select' })}
        onOpenParent={() => setScreen({ kind: 'parent', afterMission: false })}
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
        storyMissionsInOrder={
          missionLibrary
            ? missionLibrary.missionOrder.map((id) => missionLibrary.missions[id]).filter((m): m is Mission => !!m)
            : []
        }
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
        guidanceUses={profile?.guidance ?? {}}
        onGuidanceUse={guidanceUsed}
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

  // WO-24 (AD-07 beat 13/14): Mission 1's own tip->handoff transition skips 'teachback'/'ouchi'
  // entirely (stageCompleted routes co-play straight to 'handoff') — its teach-back moment now
  // lives on the parent's own turn instead (see 'stage-teachback' below). Every other mission's
  // sequence through these two screens is unaffected.
  if (screen.kind === 'teachback') {
    const advance = () => {
      addStamp();
      track('teachback_done');
      setScreen({ kind: 'ouchi' });
    };
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
    // WO-25 #6 / WO-26: shared by both the old screen-by-screen flow (reached from 'ouchi') and
    // the continuous stage (reached from stageCompleted) — solo must never proceed into the
    // handoff/parent sequence from here either, same P0 rule as everywhere else.
    return (
      <div className="mission-shell__wrapper">
        <p className="mission-shell__perspective-voice">{mission.perspective.voice}</p>
        <p><Ruby text={mission.perspective.text} /></p>
        <button type="button" onClick={() => setScreen(solo ? { kind: 'complete' } : { kind: 'handoff' })}>
          {ui.handoffContinue}
        </button>
      </div>
    );
  }

  if (screen.kind === 'handoff') {
    const toParent = () => {
      track('parent_screen_view');
      setScreen({ kind: 'parent', afterMission: true });
    };
    // WO-24/25 (AD-07 §4D わたす / beat 14-15): Mission 1 only — "child sees only [the prompt]
    // and one action." Solo already never reaches this screen for Mission 1 (stageCompleted
    // routes solo straight to 'complete'). The continue action goes to the Mission-1-only
    // parent-turn teach-back beat, never the dense multi-control parent dashboard — every other
    // mission keeps the original generic Handoff (prompt + continue + skip, straight to
    // 'parent') below, completely unchanged.
    if (continuousStageMissionIds?.has(mission.id)) {
      return (
        <Handoff
          prompt={ui.stageHandoffPrompt}
          continueLabel={ui.stageHandoffGiven}
          onContinue={() => {
            setParentGaveTeachBack(false);
            setScreen({ kind: 'stage-teachback' });
          }}
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

  // WO-24 (AD-07 beat 15): the parent's own turn — clean parent register, ONE teach-back
  // prompt (the mission's own authored teachBack line, preserved verbatim — the ouchiTalk line
  // sits alongside it as read-only context, not a second decision), ONE dedicated action. That
  // action is the real M2b attestation (src/engine/milestones.ts's applyM2Confirmed, via the
  // exact same confirmM2b() every mission's parent screen already uses) — a parent hearing
  // their child teach it back IS the M2b moment AD-07 describes, not a new mechanism. Reached
  // only from Mission 1's own co-play 'handoff' screen.
  if (screen.kind === 'stage-teachback') {
    // WO-25 #6 (P0): two steps, ONE primary action each — "optional/secondary parent tools
    // must NOT compete with the primary task." Step 1 is the teach-back attestation; step 2 is
    // the one persistent, always-in-view "give it back" action. Neither step shows the dense
    // multi-control parent screen (Toolbox/M0/M5/Bank) — Mission 1 routes around it entirely,
    // exactly as the audit's P0 finding requires; nothing about that screen itself changes for
    // a parent who opens it independently via Course Home's own standing おうちの方へ button.
    if (!parentGaveTeachBack) {
      const gotIt = () => {
        addStamp();
        track('teachback_done');
        confirmM2b();
        setParentGaveTeachBack(true);
      };
      return (
        <div className="mission-shell__wrapper mission-shell__wrapper--parent">
          <p><Ruby text={mission.teachBack} /></p>
          <p className="mission-shell__stage-teachback-ouchi"><Ruby text={mission.ouchiTalk} /></p>
          <button type="button" onClick={gotIt}>
            {ui.stageParentGotItLabel}
          </button>
        </div>
      );
    }
    return (
      <div className="mission-shell__wrapper mission-shell__wrapper--parent">
        <button
          type="button"
          className="mission-shell__stage-return-to-child"
          onClick={() => setScreen({ kind: 'complete' })}
        >
          {ui.stageReturnToChild}
        </button>
      </div>
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
        onTryOutside={() => setScreen({ kind: 'parent', afterMission: true })}
      />
    );
  }

  const m2Achieved = profile?.milestones?.M2?.achieved ?? false;
  const m0Achieved = profile?.milestones?.M0?.achieved ?? false;
  return (
    <div className="mission-shell__parent">
      {/* WO-27 §11: the same fixed-footer split Course Home already uses (its own WO-23 §7
         "continue action fell below the fold" fix) — M0/M2b/M5/Bank stay in the scrollable
         region exactly as authored, only the final action moves into its own always-visible
         footer, so a parent who just completed M0/M2b never has to scroll to find their way
         back to the child at 390×844. No reordering, no new content, no visual redesign. */}
      <div className="mission-shell__parent-scroll">
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
      </div>
      {/* WO-23 §7 (AD-06 RC-1): the one thing this screen never had — a way onward. Every prior
         action on this screen (M0/M2b/M5/Bank) stays exactly as it was; this just adds the
         missing next step, so a family never needs to reload /play/ to continue. */}
      {/* WO-24 (AD-07 §4D): Mission 1's own ui.stageReturnToChild copy — the explicit return-
         to-child-register action AD-07 names. Every other mission keeps the generic label. */}
      <div className="mission-shell__parent-footer">
        {/* WO-27: only a real mission handoff ends in that mission's own completion screen —
           the parent opened this screen independently (Course Home's own standing button, no
           just-finished mission at all) goes back to Course Home directly instead, never
           fabricating a completion screen for content nobody played. */}
        <button
          type="button"
          className="mission-shell__to-complete"
          onClick={() => (screen.kind === 'parent' && screen.afterMission ? setScreen({ kind: 'complete' }) : goToCourseHome())}
        >
          {continuousStageMissionIds?.has(mission.id) ? ui.stageReturnToChild : ui.handoffContinue}
        </button>
      </div>
    </div>
  );
}
