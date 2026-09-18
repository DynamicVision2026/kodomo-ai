import { useState } from 'react';
import type { DigPhase } from '../../engine/types';
import { initDig, playCard, tapEarlyOk, depth, currentAnswer, type DigState } from '../../engine/digMachine';
import { Card } from '../../ui/Card';
import { Ruby } from '../../engine/ruby';
import { track } from '../../engine/analytics';
import './dig.css';

export interface DigResult {
  misses: number[];
}

export interface DigProps {
  phase: DigPhase;
  /** Fixed UI copy from module.json — templates never hard-code child-facing text (CI gate 3). */
  earlyOkLabel: string;
  onComplete: (result: DigResult) => void;
}

/**
 * Cross-section-of-earth dig screen. Spec v0.5 §4.1, §7.
 * Hand cards render via <Card kind="dig">, which never reveals a card's deepen/sideways/repeat/
 * offtopic tag — only playing it does. 「これでOK」 stays visible and enabled at every layer,
 * including the ねっこ screen, where tapping it is what hands control to the next phase.
 */
export function Dig({ phase, earlyOkLabel, onComplete }: DigProps) {
  const [state, setState] = useState<DigState>(() => initDig(phase));

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

  const { current, total } = depth(phase, state);

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
            <div className="dig__hand">
              {phase.layers[state.layer]!.hand.map((c) => (
                <Card key={c.id} kind="dig" text={c.text} onClick={() => playHandCard(c.id)} />
              ))}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        className="dig__early-ok"
        onClick={tapOk}
        disabled={!!state.challenge}
      >
        {earlyOkLabel}
      </button>
    </div>
  );
}
