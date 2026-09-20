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
  onComplete: (result: PredictionResult) => void;
}

type Stage = 'child' | 'handoff' | 'parent';

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
  onComplete,
}: PredictionBattleProps) {
  const [stage, setStage] = useState<Stage>('child');
  const [childPick, setChildPick] = useState<string | null>(null);

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

  return (
    <div className="prediction-battle">
      {stage === 'parent' && (
        <p className="prediction-battle__parent-prompt">
          <Ruby text={parentPrompt} />
        </p>
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
