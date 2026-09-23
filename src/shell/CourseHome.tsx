import { useEffect, useRef, useState } from 'react';
import type { DigPhase, Mission, ModuleUiStrings } from '../engine/types';
import type { Progress } from '../engine/storage';
import type { MoveProgressMap } from '../engine/scaffold';
import { storyState } from './progression';
import { Toolbox } from './Toolbox';
import { Mascot } from './Mascot';
import { Ruby } from '../engine/ruby';
import { HomePlane } from '../ad12/HomePlane';
import { audioScriptFor } from '../audio/registry';
import '../ad12/tokens.css';
import '../ad12/primitives.css';
import './course-home.css';

/** A Story Mission's own depth-tab total (dig layer count + root) — HomePlane's own `depthTotal`
 *  contract, matching how MissionStage itself computes `depth()`'s `total`. A mission with no dig
 *  phase at all (shouldn't happen for a real Story Mission, but content-agnostic regardless)
 *  falls back to 1 rather than throwing on unauthored/malformed content. */
function depthTotalOf(mission: Mission): number {
  const digPhase = mission.phases.find((p) => p.template === 'dig') as DigPhase | undefined;
  return digPhase ? digPhase.layers.length + 1 : 1;
}

export interface CourseHomeUi extends ModuleUiStrings {}

export interface CourseHomeProps {
  ui: CourseHomeUi;
  missionOrder: string[];
  missions: Record<string, Mission>;
  progress: Record<string, Progress>;
  /** The active profile's own next-undone mission — highlighted and auto-scrolled-to on open
   *  (AD-06 D2/J3: "returning child... home opens at current depth, scrolled to it"). */
  currentMissionId: string;
  /** WO-27: whether `missionId` is actually enterable right now — the real entry authorization
   *  (`hasAccess()`/`familyTestMode`, resolved by the caller, MissionShell), never re-derived
   *  here. The sequentially-next Story Mission is not always a PURCHASED one; Course Home's own
   *  CURRENT display must never claim it's playable when the real entry gate would refuse it
   *  (CURRENT => ENTERABLE). Bank access is unaffected — this only governs the Story shaft. */
  isStoryEntitled: (missionId: string) => boolean;
  moveProgress: MoveProgressMap;
  followMoves: string[];
  cardTypes: Record<string, { label: string }>;
  hasBank: boolean;
  onContinue: () => void;
  onSelectMission: (missionId: string) => void;
  onOpenBank: () => void;
  onOpenParent: () => void;
  onOpenKit: () => void;
  /** Builder work order §7: opens a COMPLETED lesson's own registered audio (pre or post,
   *  whichever it has) back up for replay, independent of the active mission/dig entirely — see
   *  MissionShell.tsx's own `'replay-audio'` screen, which never writes evidence. Omitted, this
   *  affordance simply never renders (every existing caller/test keeps working unchanged). */
  onReplayMission?: (missionId: string) => void;
}

/**
 * WO-23 WP-4 (AD-06 D4/RC-1): the central navigation shell — "does the earth cross-section,
 * scrolling downward" metaphor the product's own vocabulary (掘る/ねっこ/ふかさメーター) already
 * implies. This is the single highest-value new screen in the sprint: before it existed, nothing
 * in the running app could reach Missions 2-8 or any of the 12 Bank Digs except by completing
 * every prior mission in a fixed, unstoppable sequence with no way back — the RC-1 finding this
 * closes.
 *
 * Deliberately NOT an LMS dashboard: no percentage, no score, no progress bar, no table. A depth
 * ahead of the current one is shown dimmed — "not dug yet" — never a locked/denied affordance;
 * tapping it still works exactly like tapping the current depth (the caller's own entitlement
 * check, unchanged, decides whether it's actually playable).
 */
export function CourseHome({
  ui, missionOrder, missions, progress, currentMissionId, isStoryEntitled, moveProgress,
  followMoves, cardTypes, hasBank, onContinue, onSelectMission, onOpenBank, onOpenParent, onOpenKit,
  onReplayMission,
}: CourseHomeProps) {
  const currentRef = useRef<HTMLLIElement>(null);
  /** WO-26 §7: a Story ahead of CURRENT is LOCKED — tapping it never navigates away. Instead it
   *  shows a short diegetic explanation right there and redirects attention back to CURRENT
   *  (never a browser-style error, never a silently-broken button). One id at a time — tapping
   *  a different locked depth, or CURRENT itself, replaces/clears it. */
  const [lockedTapId, setLockedTapId] = useState<string | null>(null);

  useEffect(() => {
    // jsdom (the test DOM) doesn't implement scrollIntoView — guard so tests don't crash.
    currentRef.current?.scrollIntoView?.({ block: 'center' });
  }, [currentMissionId]);

  const currentMission = missions[currentMissionId];
  /** WO-26A: `currentMissionId` falls back to the caller's own default mission (Story 1) once
   *  every Story Mission is done (MissionShell.resolveMission has nothing undone left to
   *  return) — so `currentMission` above stays truthy even with no genuine CURRENT, and the
   *  ordinary continue CTA would otherwise both show and silently replay Story 1. Computed
   *  directly from `progress`, independent of that fallback: true only once every Story Mission
   *  this shaft actually lists is done. Requires more than one Story Mission in the shaft — a
   *  caller with no real `missionLibrary` (MissionShell's own single-mission fallback, still
   *  used by several existing tests) has exactly one, and finishing "the whole course" there is
   *  indistinguishable from finishing that one mission, so it keeps its prior replay behavior. */
  const storyIds = missionOrder.filter((id) => missions[id]);
  const moduleComplete = storyIds.length > 1 && storyIds.every((id) => progress[id]?.done);
  const currentEntitled = isStoryEntitled(currentMissionId);

  function tapDepth(id: string, locked: boolean) {
    if (locked) {
      setLockedTapId(id);
      currentRef.current?.scrollIntoView?.({ block: 'center' });
      return;
    }
    setLockedTapId(null);
    onSelectMission(id);
  }

  return (
    <div className="ad12 course-home">
      <div className="course-home__scroll">
        <div className="course-home__header">
          <Mascot state="curious" />
          <p className="course-home__heading">{ui.courseHomeHeading}</p>
        </div>

        <Toolbox
          followMoves={followMoves}
          cardTypes={cardTypes}
          moveProgress={moveProgress}
          heading={ui.courseHomeGrowthLabel}
        />

        <ol className="course-home__shaft" aria-label={ui.courseHomeHeading}>
          {missionOrder.map((id) => {
            const m = missions[id];
            if (!m) return null;
            const state = storyState(id, progress, currentMissionId);
            const done = state === 'completed';
            const sequentiallyCurrent = state === 'current';
            // WO-27: CURRENT => ENTERABLE — a sequentially-next Story the family hasn't
            // purchased access to is never presented as playable (no robot, no "is-current").
            // It renders and behaves exactly like a LOCKED depth instead, just with the real
            // entitlement message on tap (the SAME message MissionShell's own real entry check
            // would show), never the sequencing one — this isn't "not reached yet", it's
            // "reached, needs a purchase".
            const needsPurchase = sequentiallyCurrent && !currentEntitled;
            const isCurrent = sequentiallyCurrent && currentEntitled;
            const locked = state === 'locked' || needsPurchase;
            const cls = [
              'course-home__depth',
              done ? 'is-done' : '',
              isCurrent ? 'is-current' : '',
              locked ? 'is-ahead is-locked' : '',
            ].filter(Boolean).join(' ');
            return (
              <li key={id} ref={isCurrent || needsPurchase ? currentRef : undefined} className={cls}>
                {/* AD-12 §4 state 11 (Home) / F9: "each lesson is a white plane... no numbers,
                   no stars — the only completion signal is the depth-tab row itself" — replaces
                   the old gold "◆" marker + text done-label with HomePlane's own DepthRow.
                   `current`/`locked` are real-coverage additions to HomePlane (not one of the 12
                   sample states) covering Course Home's own 3-state model. */}
                <HomePlane
                  title={m.title}
                  done={done}
                  depthTotal={done ? depthTotalOf(m) : undefined}
                  current={isCurrent}
                  locked={locked}
                  onSelect={() => tapDepth(id, locked)}
                />
                {/* Builder work order §7: "a completed lesson's plane offers a small replay icon
                   that opens its pocket... Lessons that are not completed offer nothing." A
                   sibling of HomePlane's own single `<button>` (never nested inside it — HTML
                   forbids a button inside a button), shown only once BOTH this depth is actually
                   done AND it has a registered AudioScript (pre or post — audioScriptFor doesn't
                   distinguish, the replay screen plays whichever the mission has) to open. */}
                {done && onReplayMission && audioScriptFor(id) && (
                  <button
                    type="button"
                    className="course-home__depth-replay ad12-tappable"
                    onClick={() => onReplayMission(id)}
                    aria-label={ui.audioReplayLabel}
                  >
                    <span aria-hidden="true">↻</span>
                  </button>
                )}
                {/* WO-24 (AD-07 §12): "Robot stands at the current dig site" — a small, plain
                   positional cue (never a reward badge), not a second mascot with its own
                   reactive state. */}
                {isCurrent && <span className="course-home__depth-robot" aria-hidden="true">🤖</span>}
                {locked && (
                  <p className="course-home__depth-mark course-home__depth-mark--ahead">{ui.courseHomeNotYetLabel}</p>
                )}
                {/* WO-26 §7 / WO-27: LOCKED must "not look broken" — a short diegetic
                   explanation right where the tap happened, never a browser-style error, never
                   a navigation. `needsPurchase` reuses the SAME message the real entry gate
                   shows, so tapping here is never inconsistent with what actually entering it
                   would show. */}
                {locked && lockedTapId === id && (
                  <p className="course-home__depth-locked-note">
                    <Ruby text={needsPurchase ? ui.lockedMessage : ui.courseHomeSequentialLockedMessage} />
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* WO-23 WP-3 (AD-06 D7 thumb zone): a fixed-height footer, never part of the scrollable
         shaft above — the one thing a 390x844 Playwright walkthrough caught: with 8 depths
         listed, the continue action fell ~200px below the fold when it was just the last item
         in normal document flow. Capping .course-home to 100dvh and giving only .course-home__scroll
         its own overflow keeps this footer on-screen at every viewport, no scrolling required. */}
      <div className="course-home__footer">
        {/* WO-26A: once every Story Mission is done, there is no genuine CURRENT to continue
           into — show the existing Module 1 completed state instead of the ordinary main-story
           continue CTA (whose fallback would otherwise silently replay Story 1). Bank access
           (below) and each COMPLETED depth's own replay affordance are both unaffected.
           WO-27: a sequentially-next Story the family hasn't purchased is the same story —
           never the ordinary continue CTA (which would silently hit the real entry gate and
           flash to the locked screen), the same real entitlement message instead, always
           visible here rather than requiring a tap on the now-dimmed shaft item. */}
        {moduleComplete ? (
          <p className="course-home__footer-note">{ui.completeCourseFinishedLabel}</p>
        ) : currentMission && !currentEntitled ? (
          <p className="course-home__footer-note"><Ruby text={ui.lockedMessage} /></p>
        ) : (
          currentMission && (
            <button type="button" className="course-home__continue" onClick={onContinue}>
              {ui.courseHomeContinueLabel}
            </button>
          )
        )}

        <div className="course-home__bottom-bar">
          {hasBank && (
            // WO-28 §3: Bank Digs read as a side tunnel branching off the main Story shaft, not
            // an equally-weighted nav item — same click behaviour, distinct visual treatment only.
            <button type="button" className="course-home__nav-item course-home__nav-item--bank" onClick={onOpenBank}>
              <span className="course-home__nav-item-icon" aria-hidden="true">⛏️</span>
              {ui.courseHomeBankLabel}
            </button>
          )}
          <button type="button" className="course-home__nav-item" onClick={onOpenParent}>
            {ui.parentScreenHeading}
          </button>
          <button type="button" className="course-home__nav-item" onClick={onOpenKit}>
            {ui.courseHomeKitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
