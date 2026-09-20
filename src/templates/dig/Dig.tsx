import { useState } from 'react';
import type { DigPhase, ModuleUiStrings } from '../../engine/types';
import {
  initDig, playCard, tapEarlyOk, judgeNotEnough, chooseGap, depth, currentAnswer,
  type DigState, type GapChoice,
} from '../../engine/digMachine';
import { resolveDigLayerPredictionOptions } from '../../engine/predictions';
import { Card } from '../../ui/Card';
import { Ruby } from '../../engine/ruby';
import { track } from '../../engine/analytics';
import { PredictionBattle } from '../prediction-battle';
import './dig.css';

export interface DigResult {
  misses: number[];
}

export interface DigProps {
  phase: DigPhase;
  ui: ModuleUiStrings;
  /** Solo play: every prediction battle in this phase auto-skips. Spec v0.5 pillar 5. */
  solo: boolean;
  onComplete: (result: DigResult) => void;
}

/**
 * Cross-section-of-earth dig screen. Spec v0.5 §4.1, §7.
 * Hand cards render via <Card kind="dig">, which never reveals a card's deepen/sideways/repeat/
 * offtopic tag — only playing it does. 「これでOK」 stays visible and enabled at every layer,
 * including the ねっこ screen, where tapping it is what hands control to the next phase.
 *
 * A layer's own `prediction` (よそうバトル, §4.2) runs here rather than being sequenced by a
 * host: it is that layer's data, the same way `earlyOk` already is, and gating it externally
 * would need Dig to expose layer-transition timing it otherwise keeps entirely internal.
 *
 * WO-02/WO-03: each layer's hand is behind a mandatory 「これでOK？」 judgment gate — see
 * `DigState.gate` in digMachine.ts. Judging "not enough" leads to AD-01's Gap Naming (target gap
 * + two authored distractors, shuffled per presentation); naming any of the three — no verdict,
 * no filtering — reveals the same complete hand. A prediction battle, where present, still runs
 * first; the gate applies to what comes after it, same as it does for a layer with no battle.
 */
export function Dig({ phase, ui, solo, onComplete }: DigProps) {
  const [state, setState] = useState<DigState>(() => initDig(phase));
  const [battledLayers, setBattledLayers] = useState<ReadonlySet<number>>(new Set());

  function playHandCard(cardId: string) {
    if (state.finished) return;
    const layer = phase.layers[state.layer];
    const card = layer?.hand.find((c) => c.id === cardId);
    if (!card) return;
    const prevLayer = state.layer;
    const next = playCard(phase, state, card);
    setState(next);
    if (next.finished) {
      // The ねっこ screen renders now; onComplete waits for the player to tap これでOK so they
      // actually get to read it, instead of the phase handing off in the same tick it arrives.
      track('root_reached');
    } else if (next.layer !== prevLayer) {
      track('dig_layer_reached', { layer: next.layer + 1 });
    }
  }

  function tapOk() {
    if (state.challenge) return;
    track('early_ok_tapped');
    if (state.atRoot) {
      onComplete({ misses: state.misses });
      return;
    }
    const next = tapEarlyOk(phase, state);
    setState(next);
    if (next.finished) onComplete({ misses: next.misses });
  }

  function dismissChallenge() {
    setState((s) => (s.challenge ? { ...s, challenge: null } : s));
  }

  function judgeNotEnoughTapped() {
    setState((s) => judgeNotEnough(phase, s));
  }

  function gapChosen(choice: GapChoice) {
    // AD-01 §5: recorded for its classification only — no verdict, no retry, hand unfiltered.
    track('gap_named', { classification: choice.kind });
    setState((s) => chooseGap(s));
  }

  const { current, total } = depth(phase, state);
  const currentLayer = state.atRoot ? undefined : phase.layers[state.layer];
  const pendingBattle = currentLayer?.prediction && !battledLayers.has(state.layer) ? currentLayer.prediction : null;

  return (
    <div className="dig">
      <ol className="dig__meter" aria-label="depth">
        {Array.from({ length: total }, (_, i) => (
          <li key={i} className={i < current ? 'dig__meter-dot is-filled' : 'dig__meter-dot'} />
        ))}
      </ol>

      {state.challenge ? (
        <div className="dig__challenge">
          <p className="dig__challenge-from">{state.challenge.challenger}</p>
          <p className="dig__challenge-asks">
            <Ruby text={state.challenge.asks} />
          </p>
          <button type="button" className="dig__challenge-back" onClick={dismissChallenge}>
            {'↩'}
          </button>
        </div>
      ) : (
        <>
          <p className="dig__answer">
            {state.atRoot && <span className="dig__root-label">{phase.root.label}</span>}
            <Ruby text={currentAnswer(phase, state)} />
          </p>
          {state.flatReply && (
            <p className="dig__flat-reply">
              <Ruby text={state.flatReply} />
            </p>
          )}
          {!state.atRoot && (
            pendingBattle ? (
              <PredictionBattle
                options={resolveDigLayerPredictionOptions(currentLayer!, pendingBattle)}
                solo={solo}
                skipLabel={ui.predictionSkip}
                handoffPrompt={ui.handoffPrompt}
                handoffContinueLabel={ui.handoffContinue}
                handoffSkipLabel={ui.handoffSkip}
                onComplete={() => setBattledLayers((s) => new Set(s).add(state.layer))}
              />
            ) : state.gate === 'gate' ? (
              <div className="dig__judgment">
                <button type="button" className="dig__judgment-not-enough" onClick={judgeNotEnoughTapped}>
                  {ui.judgeNotEnough}
                </button>
              </div>
            ) : state.gate === 'gapNaming' ? (
              <div className="dig__gap-naming">
                {state.gapChoices!.map((choice, i) => (
                  <button
                    key={i}
                    type="button"
                    className="dig__gap-naming-option"
                    onClick={() => gapChosen(choice)}
                  >
                    <Ruby text={choice.text} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="dig__hand">
                {phase.layers[state.layer]!.hand.map((c) => (
                  <Card key={c.id} kind="dig" text={c.text} onClick={() => playHandCard(c.id)} />
                ))}
              </div>
            )
          )}
        </>
      )}

      <button
        type="button"
        className="dig__early-ok"
        onClick={tapOk}
        disabled={!!state.challenge || !!pendingBattle}
      >
        {ui.earlyOk}
      </button>
    </div>
  );
}
