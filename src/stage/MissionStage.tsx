import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  DigCard, DigPhase, Mission, ModuleUiStrings, SlotAssemblyPhase, SlotId,
} from '../engine/types';
import type { CardKind } from '../ui/cardKinds';
import {
  initDig, playCard, tapEarlyOk, judgeNotEnough, chooseGap, commitBlind, giveSelfReport,
  depth, currentAnswer, type DigState,
} from '../engine/digMachine';
import { resolveArchetype } from '../engine/resolver';
import { resolveSlotAssemblyPredictionOptions, resolveDigLayerPredictionOptions } from '../engine/predictions';
import { isAptUse, isAtLeast, type MoveProgressMap, type SelfReportKind } from '../engine/scaffold';
import { track } from '../engine/analytics';
import { Ruby } from '../engine/ruby';
import { Mascot, type MascotState } from '../shell/Mascot';
import { SpeechBubble } from './SpeechBubble';
import { ChoiceTray } from './ChoiceTray';
import { GuidancePulse, guidanceLevelFor, useStall, type GuidanceUses } from './Guidance';
import { useStageSfx } from './audioHooks';
import { PredictionBattle } from '../templates/prediction-battle';
import type { DigResult, UseEvidence, BlindSelfReportEvidence } from '../templates/dig';
import './stage.css';

export interface MissionStageProps {
  mission: Mission;
  ui: ModuleUiStrings;
  solo: boolean;
  moveProgress: MoveProgressMap;
  /** AD-07 §D: this profile's own per-verb guidance use counts (Profile.guidance,
   *  src/engine/storage.ts) — read-only here, SHOW/NUDGE/FADE/INDEPENDENT is re-derived from it
   *  every render via `guidanceLevelFor`. */
  guidanceUses: GuidanceUses;
  /** A verb (よむ/えらぶ/みきわめる) was just completed unprompted — bump its persisted count. */
  onGuidanceUse: (verb: 'yomu' | 'erabu' | 'mikiwameru') => void;
  onMoveRendered: (move: string) => void;
  onUse: (evidence: UseEvidence) => void;
  onBlindCommit: (move: string) => void;
  onBlindSelfReport: (evidence: BlindSelfReportEvidence) => void;
  onGapNamed: (evidence: { missionId: string }) => void;
  /** Fires once ROOT and 今日のコツ have both been read — mirrors what the old
   *  Dig-phase-complete + tip-screen-advance combination used to signal together, so
   *  MissionShell can mark the mission done and continue exactly as it always has. */
  onComplete: (result: DigResult) => void;
}

function isTerminalArchetype(claims: string[]): boolean {
  return claims.some((c) => c !== 'nonfactual');
}

/**
 * WO-24 (AD-07): Mission 1's own continuous digging scene. "STATES ARE NOT SCREENS" — this one
 * component owns the whole child-side journey from DIVE through 今日のコツ, choreographing the
 * SAME state machine Dig.tsx/SlotAssembly.tsx already use (engine unchanged, imported directly:
 * digMachine.ts, resolver.ts, predictions.ts, scaffold.ts) inside one persistent DOM tree instead
 * of a sequence of screen swaps. Mission-1-only — every other mission still renders through the
 * original SlotAssembly/Dig template components, untouched.
 *
 * Layout is two fixed regions (never a route change between them): `.stage__world` (mascot,
 * depth meter, the current dialogue/context — L2/L3) and `.stage__tray-anchor` (the one live
 * decision, pinned in the bottom thumb zone — L1, AD-07 §8/§11).
 *
 * Two intentionally-scoped exceptions, both reported in WO-24's own completion report: (1) the
 * post-tip beats (teach-back/おうちトーク/handoff/parent) stay on MissionShell's existing shared
 * screens — WO-24 §7 itself sanctions Child<->Parent as a hard transition, and those screens are
 * shared by all 8 Story Missions, out of this ticket's scope to redesign; (2) AD-07's guidance
 * levels (SHOW/NUDGE/FADE/INDEPENDENT) are tracked per-session here (`useGuidanceLevel`), not yet
 * persisted to the profile's own storage.
 */
export function MissionStage({
  mission, ui, solo, moveProgress, guidanceUses, onGuidanceUse, onMoveRendered, onUse,
  onBlindCommit, onBlindSelfReport, onGapNamed, onComplete,
}: MissionStageProps) {
  const slotPhase = mission.phases.find((p) => p.template === 'slot-assembly') as SlotAssemblyPhase | undefined;
  const digPhase = mission.phases.find((p) => p.template === 'dig') as DigPhase;
  const sfx = useStageSfx();

  // ---- DIVE (Map -> Mission, ~500ms, AD-07 §13) ---------------------------------------------
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 500);
    return () => clearTimeout(t);
  }, []);

  // ---- RISE (leaving the stage after 今日のコツ, ~500ms, AD-07 §13/§16) ----------------------
  const [rising, setRising] = useState(false);
  function riseThenComplete(result: DigResult) {
    setRising(true);
    setTimeout(() => onComplete(result), 480);
  }

  // ---- part: which beat-group is live right now ----------------------------------------------
  const [part, setPart] = useState<'slot' | 'dig' | 'tip'>(slotPhase ? 'slot' : 'dig');

  // ======================================================================================
  // SLOT part — the initial "which question do I ask?" choose beat (verb B), re-skinned.
  // ======================================================================================
  const [slotChosen, setSlotChosen] = useState<Partial<Record<SlotId, string>>>({});
  const [slotResolved, setSlotResolved] = useState<{ key: string; archetype: { robotSays: string; claims: string[] } } | null>(null);
  const [slotAttempt, setSlotAttempt] = useState(1);
  const [slotBattled, setSlotBattled] = useState<ReadonlySet<number>>(new Set());
  const [slotStallKey, setSlotStallKey] = useState(0);

  function pickSlotCard(slot: SlotId, cardId: string) {
    const next = { ...slotChosen, [slot]: cardId };
    setSlotChosen(next);
    setSlotStallKey((k) => k + 1);
    if (!slotPhase!.slots.every((s) => next[s])) return;
    const resolved = resolveArchetype(slotPhase!, next);
    setSlotResolved(resolved);
    setSlotAttempt((n) => n + 1);
    onGuidanceUse('erabu');
    track('round_complete', { archetype: resolved.key, retries: slotAttempt - 1 });
  }

  function slotDialogueRead() {
    sfx.playBubblePop();
    onGuidanceUse('yomu');
    if (isTerminalArchetype(slotResolved!.archetype.claims)) {
      setPart('dig');
    } else {
      setSlotResolved(null);
      setSlotChosen({});
    }
  }

  const slotPendingBattle = slotPhase?.predictions?.find(
    (p) => p.beforeRound === slotAttempt && !slotBattled.has(slotAttempt),
  );
  const slotGuidance = guidanceLevelFor('erabu', guidanceUses);
  const slotStalled = useStall(part === 'slot' && !slotResolved && !slotPendingBattle, slotStallKey, 6000);

  // ======================================================================================
  // DIG part — the layer-by-layer loop (JUDGE / Gap Naming / hand / dig feedback).
  // ======================================================================================
  const [state, setState] = useState<DigState>(() => initDig(digPhase));
  const [answerRead, setAnswerRead] = useState(false);
  const [flatReplyRead, setFlatReplyRead] = useState(false);
  const [settledIds, setSettledIds] = useState<ReadonlySet<string>>(new Set());
  const [battledLayers, setBattledLayers] = useState<ReadonlySet<number>>(new Set());
  const [descending, setDescending] = useState(false);
  const [judgeStallKey, setJudgeStallKey] = useState(0);
  const [handStallKey, setHandStallKey] = useState(0);
  const lastPlayedCardId = useRef<string | null>(null);

  useEffect(() => {
    setAnswerRead(false);
    setSettledIds(new Set());
    lastPlayedCardId.current = null;
  }, [state.layer, state.atRoot]);
  useEffect(() => {
    setFlatReplyRead(false);
  }, [state.flatReply]);

  const [drivingCardId, setDrivingCardId] = useState<string | null>(null);

  /** AD-07 §B/F: "the question is the shovel." A deepen pick visibly drives into the soil
   *  BEFORE the world descends — commitHandCard (the actual state transition) runs only once
   *  that drive animation has had time to play. A non-deepen pick settles immediately; its own
   *  animation runs on the settled (already-committed) chip instead, exactly as before. */
  function playHandCard(cardId: string) {
    const layer = digPhase.layers[state.layer];
    const card = layer?.hand.find((c) => c.id === cardId);
    if (!card || drivingCardId) return;
    if (card.tag === 'deepen') {
      setDrivingCardId(cardId);
      setTimeout(() => {
        setDrivingCardId(null);
        commitHandCard(card);
      }, 260);
    } else {
      commitHandCard(card);
    }
  }

  function commitHandCard(card: DigCard) {
    const prevLayer = state.layer;
    const playIndexAtLayer = state.misses[state.layer] ?? 0;
    const next = playCard(digPhase, state, card);
    if (next === state) return;
    setState(next);
    onUse({
      move: card.move, domain: card.domain, missionId: mission.id, layerIndex: prevLayer,
      timestamp: Date.now(), aptUse: isAptUse(playIndexAtLayer, card.tag),
    });
    if (next.finished) {
      track('root_reached');
      sfx.playRootChime();
    } else if (next.layer !== prevLayer) {
      track('dig_layer_reached', { layer: next.layer + 1 });
      sfx.playDeepen();
      setDescending(true);
      setTimeout(() => setDescending(false), 400);
    } else {
      // Non-deepen: the chip hits stone and settles out of the tray (AD-07 §5).
      lastPlayedCardId.current = card.id;
      sfx.playStone();
      setSettledIds((prev) => new Set(prev).add(card.id));
    }
    onGuidanceUse('erabu');
    setHandStallKey((k) => k + 1);
  }

  function onRootRead() {
    track('early_ok_tapped');
    onGuidanceUse('yomu');
    setPart('tip');
  }

  function judgeGotIt() {
    track('early_ok_tapped');
    onGuidanceUse('mikiwameru');
    setJudgeStallKey((k) => k + 1);
    setState((s) => tapEarlyOk(digPhase, s));
  }
  function judgeNotYet() {
    onGuidanceUse('mikiwameru');
    setJudgeStallKey((k) => k + 1);
    setState((s) => judgeNotEnough(digPhase, s));
  }
  function dismissChallenge() {
    onGuidanceUse('yomu');
    setState((s) => (s.challenge ? { ...s, challenge: null } : s));
  }

  function currentLayerDeepenMoves(): string[] {
    return (digPhase.layers[state.layer]?.hand ?? [])
      .filter((c) => c.tag === 'deepen' && c.move)
      .map((c) => c.move!);
  }

  function gapChosen(choiceIndex: number) {
    const choice = state.gapChoices![choiceIndex]!;
    track('gap_named', { classification: choice.kind });
    onGapNamed({ missionId: mission.id });
    const moves = currentLayerDeepenMoves();
    for (const move of moves) onMoveRendered(move);
    const eligible = moves.length === 1 && isAtLeast(moveProgress[moves[0]!]?.rung ?? 'mihakken', 'tsukaeru');
    onGuidanceUse('erabu');
    setState((s) => chooseGap(s, eligible));
  }

  function blindCommitTapped() {
    const move = currentLayerDeepenMoves()[0];
    if (move) onBlindCommit(move);
    onGuidanceUse('erabu');
    setState((s) => commitBlind(s));
  }

  function selfReportTapped(classification: SelfReportKind) {
    const move = currentLayerDeepenMoves()[0];
    if (move) onBlindSelfReport({ move, missionId: mission.id, layerIndex: state.layer, classification });
    onGuidanceUse('erabu');
    setState((s) => giveSelfReport(s));
  }

  const currentLayer = state.atRoot ? undefined : digPhase.layers[state.layer];
  const digPendingBattle = currentLayer?.prediction && !battledLayers.has(state.layer) ? currentLayer.prediction : null;
  const judgeStalled = useStall(part === 'dig' && !state.challenge && answerRead && state.gate === 'gate', judgeStallKey, 12000);
  const judgeGuidance = guidanceLevelFor('mikiwameru', guidanceUses);
  const handGuidance = guidanceLevelFor('erabu', guidanceUses);
  const handStalled = useStall(
    part === 'dig' && state.gate === 'open' && !(state.flatReply && !flatReplyRead), handStallKey, 6000,
  );

  const { current: depthCurrent, total: depthTotal } = depth(digPhase, state);

  // ---- mascot mood: a plain reaction/curiosity mood, never a verdict on the child's answer ----
  const mascotState: MascotState = state.challenge
    ? 'challenge'
    : part === 'tip' || state.atRoot
      ? 'discovery'
      : state.gate === 'gate'
        ? 'thinking'
        : 'curious';

  const depthAttr = state.atRoot || part === 'tip' ? 'root' : String(Math.min(state.layer + 1, 3));

  // ---- what's on the STAGE right now (mascot/dialogue/context — never the decision itself) ---
  let world: ReactNode = null;
  // ---- what's in the TRAY right now (the one live decision, pinned to the thumb zone) --------
  let tray: ReactNode = null;

  if (part === 'slot' && slotPhase) {
    if (slotPendingBattle) {
      world = (
        <PredictionBattle
          options={resolveSlotAssemblyPredictionOptions(slotPhase, slotPendingBattle)}
          solo={solo}
          skipLabel={ui.predictionSkip}
          handoffPrompt={ui.handoffPrompt}
          handoffContinueLabel={ui.handoffContinue}
          handoffSkipLabel={ui.handoffSkip}
          parentPrompt={ui.predictionParentPrompt}
          onComplete={() => setSlotBattled((s) => new Set(s).add(slotAttempt))}
        />
      );
    } else if (slotResolved) {
      world = <SpeechBubble speaker={ui.stageRobotName} text={slotResolved.archetype.robotSays} onAdvance={slotDialogueRead} />;
    } else {
      tray = (
        <div className="stage__hand-tray">
          <GuidancePulse level={slotStalled ? 'show' : slotGuidance} />
          {slotPhase.slots.map((slot) => (
            <ChoiceTray
              key={slot}
              // Mission-1-only prototype: chanto's one slot id ("what") is also a valid CardKind.
              // A future mission with a slot id outside that vocabulary would need its own
              // mapping here — out of WO-24's scope (Mission 1 only).
              items={slotPhase!.cards.filter((c) => c.slot === slot).map((c) => ({ id: c.id, text: c.text, kind: slot as CardKind }))}
              onSelect={(id) => pickSlotCard(slot, id)}
            />
          ))}
        </div>
      );
    }
  } else if (part === 'dig') {
    if (state.challenge) {
      world = <SpeechBubble speaker={state.challenge.challenger} text={state.challenge.asks} onAdvance={dismissChallenge} />;
    } else if (!answerRead) {
      // AD-07 §13/beat 11: "the root has a clear reveal" — the one moment the bubble itself
      // carries the reveal motion, on top of the world's own soil-color depth change.
      world = (
        <SpeechBubble
          speaker={ui.stageRobotName}
          text={currentAnswer(digPhase, state)}
          onAdvance={() => {
            if (state.atRoot) { onRootRead(); return; }
            onGuidanceUse('yomu');
            setAnswerRead(true);
          }}
          className={state.atRoot ? 'stage__root-reveal' : undefined}
        />
      );
    } else if (digPendingBattle) {
      world = (
        <PredictionBattle
          options={resolveDigLayerPredictionOptions(currentLayer!, digPendingBattle)}
          solo={solo}
          skipLabel={ui.predictionSkip}
          handoffPrompt={ui.handoffPrompt}
          handoffContinueLabel={ui.handoffContinue}
          handoffSkipLabel={ui.handoffSkip}
          parentPrompt={ui.predictionParentPrompt}
          onComplete={() => setBattledLayers((s) => new Set(s).add(state.layer))}
        />
      );
    } else if (state.gate === 'gate') {
      // AD-07 §4C: "the previous robot answer remains visible as context" — still on screen,
      // already-read, while the two JUDGE buttons wait in the tray below.
      world = <p className="stage__judge-context"><Ruby text={currentAnswer(digPhase, state)} /></p>;
      tray = (
        <div className="stage__judge stage__beat-enter">
          {/* AD-07 §4C/§9: "both buttons pulse alternately, never one alone" at SHOW; a plain
             glow at NUDGE; nothing non-diegetic once FADE/INDEPENDENT. This level is NEVER
             boosted by the 12s JUDGE stall (that raises only Pon太's whisper below, per AD-07
             §10's own explicit "never step back on JUDGE for thinking time" rule). */}
          <div className={`stage__judge-buttons stage__judge-buttons--${judgeGuidance}`}>
            <button type="button" className="stage__judge-button stage__judge-button--yes" onClick={judgeGotIt}>
              {ui.earlyOk}
            </button>
            <button type="button" className="stage__judge-button stage__judge-button--no" onClick={judgeNotYet}>
              {ui.judgeNotEnough}
            </button>
          </div>
          {judgeStalled && <p className="stage__judge-stall">{ui.stageJudgeStallPrompt}</p>}
        </div>
      );
    } else if (state.gate === 'gapNaming') {
      tray = (
        <ChoiceTray
          items={state.gapChoices!.map((c, i) => ({ id: String(i), text: c.text }))}
          onSelect={(id) => gapChosen(Number(id))}
        />
      );
    } else if (state.gate === 'blindCommit') {
      tray = <ChoiceTray items={[{ id: 'commit', text: ui.blindCommit }]} onSelect={blindCommitTapped} />;
    } else if (state.flatReply && !flatReplyRead) {
      world = (
        <SpeechBubble
          speaker={ui.stageRobotName}
          text={state.flatReply}
          onAdvance={() => {
            onGuidanceUse('yomu');
            setFlatReplyRead(true);
          }}
        />
      );
    } else {
      tray = (
        <div className="stage__hand-tray">
          <GuidancePulse level={handStalled ? 'show' : handGuidance} />
          {state.awaitingSelfReport && (
            <ChoiceTray
              items={[
                { id: 'same', text: ui.blindSelfReportSame },
                { id: 'better', text: ui.blindSelfReportBetter },
                { id: 'different', text: ui.blindSelfReportDifferent },
              ]}
              onSelect={(id) => selfReportTapped(id as SelfReportKind)}
            />
          )}
          <ChoiceTray
            items={digPhase.layers[state.layer]!.hand
              .filter((c) => !settledIds.has(c.id))
              .map((c) => ({ id: c.id, text: c.text }))}
            onSelect={playHandCard}
            settlingId={lastPlayedCardId.current}
            drivingId={drivingCardId}
          />
        </div>
      );
    }
  } else if (part === 'tip') {
    // AD-07 beat 13: "one line, large... 「つぎへ」 (no bubble here, so a button)" — the one
    // place よむ's usual tap-to-read bubble is deliberately NOT used; this is the sole
    // surviving 「つぎへ」, everywhere else replaced by dialogue taps.
    world = <p className="stage__tip-line"><Ruby text={mission.tip} /></p>;
    tray = (
      <button
        type="button"
        className="stage__next-button stage__beat-enter"
        disabled={rising}
        onClick={() => riseThenComplete({ misses: state.misses, layerCount: digPhase.layers.length })}
      >
        {ui.stageNextLabel}
      </button>
    );
  }

  return (
    <div className={`stage${entering ? ' is-diving' : ''}${rising ? ' is-rising' : ''}`}>
      <div className={`stage__world${descending ? ' is-descending' : ''}`} data-depth={depthAttr}>
        {part !== 'tip' && (
          <ol className="stage__meter" aria-label="depth">
            {Array.from({ length: depthTotal }, (_, i) => (
              <li key={i} className={i < depthCurrent ? 'stage__meter-dot is-filled' : 'stage__meter-dot'} />
            ))}
          </ol>
        )}
        <div className="stage__actor-row">
          <Mascot state={mascotState} />
        </div>
        {world}
      </div>
      {tray && <div className="stage__tray-anchor">{tray}</div>}
    </div>
  );
}
