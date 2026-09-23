import type { DigPhase, Mission, ModuleUiStrings } from '../engine/types';
import { Mascot } from './Mascot';
import { Ruby } from '../engine/ruby';
import './mission-complete.css';

export interface MissionCompleteProps {
  ui: ModuleUiStrings;
  mission: Mission;
  cardTypes: Record<string, { label: string }>;
  /** The active profile's next-undone mission, already resolved by the caller — null means the
   *  whole course is done (never a dead end, see ui.completeCourseFinishedLabel). */
  nextMission: Mission | null;
  onNext: () => void;
  onBackToMap: () => void;
  onTryOutside: () => void;
  /** Builder work order §7: "Post-dig audio... shown at mission complete as today, replayable
   *  there." Omitted, the replay action simply doesn't render — every mission without its own
   *  post-dig audio (most of them) keeps this screen exactly as it always was. */
  onReplayAudio?: () => void;
}

/** Every distinct move this mission's own dig phase(s) actually exercised — real content, not
 *  cross-mission profile growth (that's what the Toolbox already shows separately). */
function practicedMoves(mission: Mission): string[] {
  const moves = new Set<string>();
  for (const phase of mission.phases) {
    if (phase.template !== 'dig') continue;
    for (const layer of (phase as DigPhase).layers) {
      for (const card of layer.hand) {
        if (card.tag === 'deepen' && card.move) moves.add(card.move);
      }
    }
  }
  return [...moves];
}

/**
 * WO-23 §7 (AD-06 D3 COMPLETE state): the real completion screen the audit's own "completion
 * lacks navigation" finding names directly. Reached from the parent screen's own final action —
 * never replaces it, adds the one thing it was missing: a named next step, so a family never
 * needs to reload /play/ to continue (AD-06 §7's own explicit requirement).
 */
export function MissionComplete({
  ui, mission, cardTypes, nextMission, onNext, onBackToMap, onTryOutside, onReplayAudio,
}: MissionCompleteProps) {
  const moves = practicedMoves(mission);
  // WO-28 §8: nextMission === null already means "the whole course is done" (the caller resolves
  // this, unchanged) — reused here only to pick a visual treatment, no new completion logic.
  const courseComplete = nextMission === null;
  const cls = ['mission-complete', courseComplete ? 'mission-complete--course-complete' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {courseComplete && <span className="mission-complete__seal" aria-hidden="true">◆</span>}
      <Mascot state="discovery" />
      <p className="mission-complete__heading">{ui.completeHeading}</p>

      <div className="mission-complete__discovered">
        <p className="mission-complete__discovered-text"><Ruby text={mission.tip} /></p>
      </div>

      {moves.length > 0 && (
        <div className="mission-complete__tools">
          <p className="mission-complete__tools-label">{ui.completeToolLabel}</p>
          <ul className="mission-complete__tools-list">
            {moves.map((move) => (
              <li key={move}>{cardTypes[move]?.label ?? move}</li>
            ))}
          </ul>
        </div>
      )}

      {nextMission ? (
        <p className="mission-complete__next-preview"><Ruby text={nextMission.title} /></p>
      ) : (
        <p className="mission-complete__next-preview">{ui.completeCourseFinishedLabel}</p>
      )}

      <div className="mission-complete__actions">
        {nextMission && (
          <button type="button" className="mission-complete__primary" onClick={onNext}>
            {ui.completeNextMissionLabel}
          </button>
        )}
        <button type="button" className="mission-complete__secondary" onClick={onBackToMap}>
          {ui.completeBackToMapLabel}
        </button>
        <button type="button" className="mission-complete__tertiary" onClick={onTryOutside}>
          {ui.completeTryOutsideLabel}
        </button>
        {onReplayAudio && (
          <button
            type="button"
            className="mission-complete__replay ad12-tappable"
            onClick={onReplayAudio}
            aria-label={ui.audioReplayLabel}
          >
            <span aria-hidden="true">↻</span> {ui.audioReplayLabel}
          </button>
        )}
      </div>
    </div>
  );
}
