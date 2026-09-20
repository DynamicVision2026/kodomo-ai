import { useState } from 'react';
import type { DigPhase, ModuleUiStrings } from '../../engine/types';
import {
  initDig, playCard, tapEarlyOk, judgeNotEnough, chooseGap, commitBlind, giveSelfReport,
  depth, currentAnswer, type DigState, type GapChoice,
} from '../../engine/digMachine';
import { isAptUse, isAtLeast, type MoveProgressMap, type SelfReportKind } from '../../engine/scaffold';
import { resolveDigLayerPredictionOptions } from '../../engine/predictions';
import { Card } from '../../ui/Card';
import { Ruby } from '../../engine/ruby';
import { track } from '../../engine/analytics';
import { PredictionBattle } from '../prediction-battle';
import './dig.css';

export interface DigResult {
  misses: number[];
}

/**
 * WO-04 (Correction 01): evidence emitted for EVERY played follow-up card — a `use` is "a
 * follow-up card is played," full stop, not just the ones that happen to carry a `move`. This is
 * what lets a sideways/repeat/offtopic play establish that a later deepen at the same layer
 * wasn't the first play, without needing a move identity of its own to do it.
 *
 * `move`/`domain` are only present when the played card actually carries them (currently, only
 * deepen cards do — see src/engine/scaffold.ts) — sideways/repeat/offtopic plays are still
 * recorded, just with no move to attribute progression to. `aptUse` is the qualifying subset
 * (first play at the layer, `tag === 'deepen'`); it is computed the same way regardless of
 * whether `move` is present, but only evidence carrying a `move` can ever advance progression.
 */
export interface UseEvidence {
  move?: string;
  domain?: string;
  missionId: string;
  layerIndex: number;
  timestamp: number;
  aptUse: boolean;
}

/** WO-07: the child's non-evaluative self-report after a Blind-first reveal. */
export interface BlindSelfReportEvidence {
  move: string;
  missionId: string;
  layerIndex: number;
  classification: SelfReportKind;
}

export interface DigProps {
  phase: DigPhase;
  ui: ModuleUiStrings;
  /** Solo play: every prediction battle in this phase auto-skips. Spec v0.5 pillar 5. */
  solo: boolean;
  /** WO-04: carried on `UseEvidence` — Dig itself never knows the wider Mission object. */
  missionId: string;
  /** WO-07: the active profile's per-move progression — read ONLY to decide whether the current
   *  layer's move is Blind-first eligible (tsukaeru or above). Dig still never writes progression
   *  itself, and reaching tsukaeru changes nothing else about how Dig looks or plays (WO-05). */
  moveProgress: MoveProgressMap;
  onComplete: (result: DigResult) => void;
  /** WO-04: a move's follow-up card was just shown, whether or not it gets played. */
  onMoveRendered: (move: string) => void;
  /** WO-04 (Correction 01): a follow-up card was played — every tag, not just deepen. */
  onUse: (evidence: UseEvidence) => void;
  /** WO-07: 「いえた」 was tapped for an eligible move, while its hand was still hidden. */
  onBlindCommit: (move: string) => void;
  /** WO-07: the child gave one of the three accepted blind_selfreport choices after reveal. */
  onBlindSelfReport: (evidence: BlindSelfReportEvidence) => void;
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
 *
 * WO-04: revealing a layer's hand is also this move's mihakken -> moratta moment
 * (`onMoveRendered`, fired once the gate opens); playing a card that carries a `move` is a
 * `use` (`onUse`). Dig only ever emits this raw evidence — it never writes scaffold progression
 * itself.
 *
 * WO-07: reaching tsukaeru DOES now change one thing — whether the current layer's Gap Naming
 * resolves straight to the hand, or first to Blind-first (hand hidden, 「いえた」 to commit, then
 * revealed unfiltered). Eligibility is read from `moveProgress` at the moment Gap Naming
 * resolves, from that layer's own single authored deepen card's `move` — never inferred from
 * which gap was named. Everything else about the hand (complete, unfiltered, same cards) is
 * unchanged; blind_selfreport afterwards is a non-blocking reflection prompt that never gates
 * card play and never touches progression.
 */
export function Dig({
  phase, ui, solo, missionId, moveProgress, onComplete, onMoveRendered, onUse,
  onBlindCommit, onBlindSelfReport,
}: DigProps) {
  const [state, setState] = useState<DigState>(() => initDig(phase));
  const [battledLayers, setBattledLayers] = useState<ReadonlySet<number>>(new Set());

  function playHandCard(cardId: string) {
    if (state.finished) return;
    const layer = phase.layers[state.layer];
    const card = layer?.hand.find((c) => c.id === cardId);
    if (!card) return;
    const prevLayer = state.layer;
    // WO-04: a dig layer's hand is visited exactly once, ending only via its one deepen play —
    // so every prior play at this layer is necessarily non-advancing, and `misses[layer]` (read
    // BEFORE this play) is exactly the count of cards already played here. That's what
    // `isAptUse` needs to know whether this is the first play at the layer.
    const playIndexAtLayer = state.misses[state.layer] ?? 0;
    const next = playCard(phase, state, card);
    setState(next);
    if (next !== state) {
      // Correction 01: every play is `use` evidence, regardless of tag or whether the card
      // carries a move — sideways/repeat/offtopic plays still establish play order (so a later
      // deepen at this layer correctly fails isAptUse), even though they have no move of their
      // own to attribute progression to.
      onUse({
        move: card.move,
        domain: card.domain,
        missionId,
        layerIndex: prevLayer,
        timestamp: Date.now(),
        aptUse: isAptUse(playIndexAtLayer, card.tag),
      });
    }
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

  // WO-07: every dig layer's lint-enforced schema guarantees exactly one deepen card per hand
  // (pipeline/04_lint.ts's `hand` rule), so this lookup is always unambiguous — never an
  // inference, never a choice among competing moves.
  function currentLayerDeepenMove(): string | undefined {
    return phase.layers[state.layer]?.hand.find((c) => c.tag === 'deepen')?.move;
  }

  function gapChosen(choice: GapChoice) {
    // AD-01 §5: recorded for its classification only — no verdict, no retry, hand unfiltered.
    // WO-04/WO-07: gap choice has no bearing on scaffold progression or Blind-first eligibility
    // — target vs distractor is never read here. The hand this choice reveals is what makes the
    // layer's move みはっけん.
    track('gap_named', { classification: choice.kind });
    const move = currentLayerDeepenMove();
    if (move) onMoveRendered(move);
    const eligible = !!move && isAtLeast(moveProgress[move]?.rung ?? 'mihakken', 'tsukaeru');
    setState((s) => chooseGap(s, eligible));
  }

  function blindCommitTapped() {
    const move = currentLayerDeepenMove();
    if (move) onBlindCommit(move);
    setState((s) => commitBlind(s));
  }

  function selfReportTapped(classification: SelfReportKind) {
    const move = currentLayerDeepenMove();
    if (move) onBlindSelfReport({ move, missionId, layerIndex: state.layer, classification });
    setState((s) => giveSelfReport(s));
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
            ) : state.gate === 'blindCommit' ? (
              <div className="dig__blind-commit">
                <button type="button" className="dig__blind-commit-button" onClick={blindCommitTapped}>
                  {ui.blindCommit}
                </button>
              </div>
            ) : (
              <>
                {state.awaitingSelfReport && (
                  <div className="dig__self-report">
                    <button type="button" onClick={() => selfReportTapped('same')}>
                      {ui.blindSelfReportSame}
                    </button>
                    <button type="button" onClick={() => selfReportTapped('better')}>
                      {ui.blindSelfReportBetter}
                    </button>
                    <button type="button" onClick={() => selfReportTapped('different')}>
                      {ui.blindSelfReportDifferent}
                    </button>
                  </div>
                )}
                <div className="dig__hand">
                  {phase.layers[state.layer]!.hand.map((c) => (
                    <Card key={c.id} kind="dig" text={c.text} onClick={() => playHandCard(c.id)} />
                  ))}
                </div>
              </>
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
