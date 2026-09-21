import { useEffect, useState } from 'react';
import type { PredictionOption } from '../../engine/predictions';
import { Ruby } from '../../engine/ruby';
import { track } from '../../engine/analytics';
import { Handoff } from '../handoff';
import './prediction-battle.css';

export interface PredictionResult {
  skipped: boolean;
  childPick?: string;
  parentPick?: string;
}

export interface PredictionBattleProps {
  /** Pre-resolved by src/engine/predictions.ts — this template never interprets phase data. */
  options: PredictionOption[];
  /** Solo play skips the whole battle without rendering anything. Spec v0.5 pillar 5. */
  solo?: boolean;
  skipLabel: string;
  handoffPrompt: string;
  handoffContinueLabel: string;
  handoffSkipLabel: string;
  /** WO-19 Phase 3B — the "Parent Unknown" pattern: shown only during the parent's own turn,
   *  reassuring them they don't need to know the right answer. Fixed UI chrome (module.json's
   *  `ui.predictionParentPrompt`), never mission content. */
  parentPrompt: string;
  /** WO-25B (G8): names what the parent's own choice actually IS ("guess which one is closest
   *  to the robot's real answer") — `parentPrompt` above is reassurance, never a task
   *  description on its own, which the audit's own live evidence found left the parent unsure
   *  what to do with the options. Optional and additive: every existing caller that omits it
   *  keeps exactly its old parent-turn copy (just `parentPrompt`), unchanged. */
  parentTaskPrompt?: string;
  /** WO-25B (G8): when supplied together with `handbackActionLabel`, the parent's pick no
   *  longer hands control back to the child immediately — an explicit "give the device back"
   *  screen (this prompt + one button) sits between the parent's own choice and whatever
   *  child-facing UI comes next, so a family is never surprised by child controls appearing
   *  right under the parent's thumb. Optional and additive: omitting both keeps every existing
   *  caller's original parent-pick -> onComplete() behaviour exactly as it was. */
  handbackPrompt?: string;
  handbackActionLabel?: string;
  onComplete: (result: PredictionResult) => void;
}

type Stage = 'child' | 'handoff' | 'parent' | 'handback';

/**
 * よそうバトル. Overlay before a reveal: the child predicts, the device is handed off, the
 * parent predicts, then control returns to the caller — the actual reveal (which pick was
 * right) happens in whatever plays next, not here. Spec v0.5 §4.2, §7.
 */
export function PredictionBattle({
  options,
  solo,
  skipLabel,
  handoffPrompt,
  handoffContinueLabel,
  handoffSkipLabel,
  parentPrompt,
  parentTaskPrompt,
  handbackPrompt,
  handbackActionLabel,
  onComplete,
}: PredictionBattleProps) {
  const [stage, setStage] = useState<Stage>('child');
  const [childPick, setChildPick] = useState<string | null>(null);
  const [parentPick, setParentPick] = useState<string | null>(null);

  useEffect(() => {
    if (solo) onComplete({ skipped: true });
    // Only `solo` should ever re-trigger this; onComplete is a per-render caller callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo]);

  if (solo) return null;

  function pickChild(key: string) {
    setChildPick(key);
    track('prediction_made', { who: 'child', pick: key });
    setStage('handoff');
  }

  function pickParent(key: string) {
    track('prediction_made', { who: 'parent', pick: key });
    if (handbackPrompt && handbackActionLabel) {
      setParentPick(key);
      setStage('handback');
      return;
    }
    onComplete({ skipped: false, childPick: childPick ?? undefined, parentPick: key });
  }

  function skip() {
    onComplete({ skipped: true });
  }

  if (stage === 'handoff') {
    return (
      <Handoff
        prompt={handoffPrompt}
        continueLabel={handoffContinueLabel}
        skipLabel={handoffSkipLabel}
        onContinue={() => setStage('parent')}
        onSkip={skip}
      />
    );
  }

  if (stage === 'handback') {
    return (
      <Handoff
        prompt={handbackPrompt!}
        continueLabel={handbackActionLabel!}
        onContinue={() => onComplete({ skipped: false, childPick: childPick ?? undefined, parentPick: parentPick ?? undefined })}
      />
    );
  }

  return (
    <div className="prediction-battle">
      {stage === 'parent' && (
        <>
          {parentTaskPrompt && (
            <p className="prediction-battle__parent-task">
              <Ruby text={parentTaskPrompt} />
            </p>
          )}
          <p className="prediction-battle__parent-prompt">
            <Ruby text={parentPrompt} />
          </p>
        </>
      )}
      <div className="prediction-battle__options">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className="prediction-battle__option"
            onClick={() => (stage === 'parent' ? pickParent(o.key) : pickChild(o.key))}
          >
            <Ruby text={o.label} />
          </button>
        ))}
      </div>
      <button type="button" className="prediction-battle__skip" onClick={skip}>
        {skipLabel}
      </button>
    </div>
  );
}
