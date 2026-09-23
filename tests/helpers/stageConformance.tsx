import { render, screen, waitFor, within } from '@testing-library/react';
import { expect, vi } from 'vitest';
import type userEvent from '@testing-library/user-event';
import type { DigPhase, Mission, ModuleUiStrings, SlotAssemblyPhase } from '../../src/engine/types';
import { MissionStage } from '../../src/stage/MissionStage';

/** Mirrors `renderRuby` (src/engine/ruby.tsx): `{漢字|かんじ}` renders as `<ruby>漢字<rt>かんじ
 *  </rt></ruby>` — base and reading both visible, adjacent. Some real Module 1 content DOES
 *  carry ruby at layer 0 (e.g. Mission 1-5/minna's own layer-0 deepen card), so this
 *  content-agnostic helper (which walks EVERY mission's real content) must handle it. */
function renderedText(raw: string): string {
  return raw.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, (_m, base: string, reading: string) => base + reading);
}

/**
 * RTL's own `getByText` computes an element's "text" from its DIRECT child text nodes only,
 * skipping nested elements entirely — so it can never match a string that spans a `<ruby>`
 * boundary (the base/reading sit in a child element, not a direct text node of the span that
 * "contains" them). Ruby-free content still works fine through `screen.getByText`, but a
 * content-agnostic helper can't assume every mission's text is ruby-free (see above). Walks the
 * DOM directly instead, comparing each element's own full (recursive) `textContent`, and returns
 * the deepest match (an ancestor of a match trivially "contains" the same text too, so it must
 * be excluded) — the same node the content-specific Mission 1 tests reach by matching on the
 * literal string when there happens to be no ruby in it.
 */
function getByAuthoredText(raw: string): HTMLElement {
  const expected = renderedText(raw).trim();
  const matches = Array.from(document.querySelectorAll<HTMLElement>('*'))
    .filter((el) => (el.textContent ?? '').trim() === expected);
  if (matches.length === 0) {
    throw new Error(`getByAuthoredText: no element renders text "${expected}" (raw: "${raw}")`);
  }
  const deepest = matches.find((el) => !matches.some((other) => other !== el && el.contains(other)));
  return deepest ?? matches[0]!;
}

/** AD-12 cutover: an ordinary dig-layer reading beat is always `.speech-bubble` (SpeechBubble,
 *  now internally AD-12's AnswerPlane) — but the ROOT reveal specifically renders AD-12's own
 *  RootPlane (`.ad12-root-plane--tappable`) whenever the mission's rootType resolves to one of
 *  the three authored forms, which is true for every real Story/Bank mission today. Either way
 *  it's the one "tap anywhere to advance" surface currently on screen. */
const ADVANCE_SELECTOR = '.speech-bubble, .ad12-root-plane--tappable';

/**
 * WO-26 §26: reusable, CONTENT-AGNOSTIC conformance helper — walks any Story Mission or Bank
 * Dig's real content through the real `MissionStage` component (the same golden-grammar
 * component every mission now plays through, `src/stage/MissionStage.tsx`), driven entirely by
 * each mission's own JSON (card tags, hand cards, layer count), never by mission-specific
 * Japanese text. Chanto's own precise, text-exact behavior already has dedicated coverage
 * (tests/Mission1Stage.test.tsx); this proves the SAME invariants hold structurally for every
 * other mission, without 20 near-duplicate copies of that file.
 *
 * Solo only (co-play ownership-transition conformance is covered separately, sampled, via full
 * MissionShell rendering — see tests/GoldenConformance.test.tsx).
 */
export async function playMissionStageToCompletion(
  user: ReturnType<typeof userEvent.setup>,
  mission: Mission,
  ui: ModuleUiStrings,
  opts?: { demonstratedLayers?: ReadonlySet<number> },
) {
  const onComplete = vi.fn();
  const onGuidanceUse = vi.fn();
  const onUse = vi.fn();
  render(
    <MissionStage
      mission={mission}
      ui={ui}
      solo
      moveProgress={{}}
      guidanceUses={{}}
      onGuidanceUse={onGuidanceUse}
      onMoveRendered={() => {}}
      onUse={onUse}
      onBlindCommit={() => {}}
      onBlindSelfReport={() => {}}
      onGapNamed={() => {}}
      onComplete={onComplete}
      demonstratedLayers={opts?.demonstratedLayers}
    />,
  );

  const slotPhase = mission.phases.find((p) => p.template === 'slot-assembly') as SlotAssemblyPhase | undefined;
  const digPhase = mission.phases.find((p) => p.template === 'dig') as DigPhase;

  if (slotPhase) {
    // §10: the question-selection tray explicitly names the decision — every time it's shown.
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument();

    // §9 ほる/non-deepen recovery: a non-CLEAR pick (VAGUE or OFFTOPIC) must visibly hit a
    // stone, stay visible/badged/disabled, never disappear — proven once here per mission.
    // AD-12 cutover: the slot round's own tray is now MoveTray/MoveCard (equal-weight choice —
    // slot cards never carried real per-choice colour differentiation even before the cutover,
    // see cardKinds.ts's own doc comment on the dig-hand 'dig' kind), never ChoiceTray/QuestionChip.
    const nonClear = slotPhase.cards.find((c) => c.tag !== 'clear');
    if (nonClear) {
      await user.click(getByAuthoredText(nonClear.text));
      // The slot round's own recovery bubble (its archetype's robotSays) needs its own ONE tap
      // (WO-25B G5) before the chip settles into its permanent blocked state.
      await waitFor(() => {
        expect(document.querySelector('.speech-bubble')).toBeInTheDocument();
      });
      await user.click(document.querySelector('.speech-bubble') as HTMLElement);
      await waitFor(() => {
        expect(getByAuthoredText(nonClear.text).closest('.ad12-move-card')!.className).toContain('ad12-move-card--blocked');
      });
      expect(within(getByAuthoredText(nonClear.text).closest('.ad12-move-card') as HTMLElement).getByText('🪨')).toBeInTheDocument();
      expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument(); // still named after recovery
    }

    // §9 causal dig / §8 よむ one-tap: the CLEAR pick resolves. Every shipped Story Mission
    // authors its CLEAR archetype's robotSays identical to dig layer 0's own opening line (the
    // convention WO-25 #1 fixed the resulting double-tap against) — wait for that text directly.
    const clearCard = slotPhase.cards.find((c) => c.tag === 'clear')!;
    await user.click(getByAuthoredText(clearCard.text));
    await waitFor(() => {
      expect(getByAuthoredText(digPhase.layers[0]!.robotSays)).toBeInTheDocument();
    });
    await user.click(getByAuthoredText(digPhase.layers[0]!.robotSays)); // ONE tap -> past layer 0's own context
  } else {
    // Bank Dig: no slot round — straight to layer 0's own opening line (verb よむ, one tap).
    await waitFor(() => {
      expect(getByAuthoredText(digPhase.layers[0]!.robotSays)).toBeInTheDocument();
    });
    await user.click(getByAuthoredText(digPhase.layers[0]!.robotSays));
  }

  // Walk every dig layer: JUDGE -> explicit GAP prompt -> hand tray (explicit question prompt,
  // one non-deepen recovery check at layer 0 only, to keep runtime bounded) -> deepen.
  for (let i = 0; i < digPhase.layers.length; i++) {
    const layer = digPhase.layers[i]!;
    await waitFor(() => {
      expect(screen.getByText(ui.earlyOk)).toBeInTheDocument();
      expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
    });
    await user.click(screen.getByText(ui.judgeNotEnough));

    // §10: GAP Naming explicitly names the decision. AD-12 §4 state 2's own SlipCascade
    // (`.ad12-recess .ad12-slip`) replaces ChoiceTray/QuestionChip for this moment.
    expect(screen.getByText(ui.stageGapPrompt)).toBeInTheDocument();
    const [gapChoice] = document.querySelectorAll('.ad12-recess .ad12-slip');
    await user.click(gapChoice as HTMLElement);

    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument();

    if (i === 0) {
      const nonDeepen = layer.hand.find((c) => c.tag !== 'deepen');
      if (nonDeepen) {
        await user.click(getByAuthoredText(nonDeepen.text));
        // The dig-hand's own flat-reply bubble (WO-25 #4) needs its own ONE tap before the
        // chip settles into its permanent blocked state and the tray reappears.
        await waitFor(() => {
          expect(document.querySelector('.speech-bubble')).toBeInTheDocument();
        });
        expect(screen.queryByText('不正解')).not.toBeInTheDocument(); // no punishment semantics
        await user.click(document.querySelector('.speech-bubble') as HTMLElement);
        await waitFor(() => {
          expect(getByAuthoredText(nonDeepen.text).closest('.ad12-move-card')!.className).toContain('ad12-move-card--blocked');
        });
        expect(screen.getByText(ui.digContinuePrompt)).toBeInTheDocument();
      }
    }

    const deepen = layer.hand.find((c) => c.tag === 'deepen')!;
    await user.click(getByAuthoredText(deepen.text));

    // Leaves the hand tray (drive + commit, or an auto-skipped solo prediction battle first).
    await waitFor(() => {
      expect(document.querySelector('.stage__hand-tray')).not.toBeInTheDocument();
    });

    if (i === digPhase.layers.length - 1) {
      // Root: explicit discovery label (§11), never a score/star/streak.
      await waitFor(() => {
        expect(screen.getByText(ui.stageRootDiscoveryLabel)).toBeInTheDocument();
      });
      expect(screen.queryByText(/\d+\s*点/)).not.toBeInTheDocument();
      // AD-12 cutover: the root reveal renders RootPlane (`.ad12-root-plane--tappable`) whenever
      // the mission's own rootType resolves to one of the three authored forms — true for every
      // real Story/Bank mission today — falling back to the ordinary SpeechBubble treatment
      // (`.speech-bubble`) only for a rootType outside that set.
      const rootBubble = document.querySelector(ADVANCE_SELECTOR) as HTMLElement;
      await user.click(rootBubble); // ONE tap -> tip
    } else {
      // Next layer's own opening line — ONE tap advances.
      await waitFor(() => {
        expect(document.querySelector('.speech-bubble')).toBeInTheDocument();
      });
      const bubble = document.querySelector('.speech-bubble') as HTMLElement;
      await user.click(bubble);
    }
  }

  // 今日のコツ: the one surviving つぎへ button (AD-07 beat 13).
  await waitFor(() => {
    expect(screen.getByText(ui.stageNextLabel)).toBeInTheDocument();
  });
  await user.click(screen.getByText(ui.stageNextLabel));

  await waitFor(() => {
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ layerCount: digPhase.layers.length }));
  });

  return { onComplete, onUse };
}

/** A layer's own mid-mission prediction battle (root layers, in this content) shows right after
 *  its opening line is read, before JUDGE — or, for a Story Mission, right at the very start of
 *  its slot round (every Story's own beforeRound:1 prediction). SOLO auto-skips it internally;
 *  CO-PLAY does not, so a caller driving a mission end to end through the real `MissionShell`
 *  (not directly through `MissionStage`, unlike the helper above) needs to bypass it explicitly,
 *  same as the pre-existing WO-25/25B test pattern (`ui.predictionSkip`). */
async function skipBattleIfPresent(user: ReturnType<typeof userEvent.setup>, ui: ModuleUiStrings) {
  const skip = screen.queryByText(ui.predictionSkip);
  if (skip) await user.click(skip);
}

/**
 * WO-33/WO-35: dismisses whichever of the two AudioScene screens is showing (src/stage/
 * AudioScene.tsx's own dispatch): the text-anchor fallback (`.speech-bubble` x2, tap-to-advance)
 * for a mission whose audio is still pending production, or the real full-playback screen (a
 * play button plus an always-available continue button) for one with real committed MP3s
 * (chanto/1-1 today). Either way the continue action alone is enough to leave the screen — never
 * requires actually pressing play, matching the screen's own "optional, never blocks" contract.
 */
async function dismissAudioScene(user: ReturnType<typeof userEvent.setup>) {
  if (document.querySelector('.speech-bubble')) {
    await user.click(document.querySelector('.speech-bubble') as HTMLElement); // the listen prompt
    await waitFor(() => expect(document.querySelector('.speech-bubble')).toBeInTheDocument());
    await user.click(document.querySelector('.speech-bubble') as HTMLElement); // the robotSays anchor
    return;
  }
  const buttons = document.querySelectorAll('[data-audio-role] button');
  await user.click(buttons[buttons.length - 1] as HTMLElement); // the continue button
}

/** Builder work order §5: the "actually played" counterpart of `dismissAudioScene` — presses
 *  さいせいする (the FIRST button on the real full-playback screen) before continuing, so
 *  `MissionShell`'s own `audioActuallyPlayed` state is true. A no-op text-anchor fallback (still
 *  pending-production content) has no real play button at all, so it falls back to a plain
 *  dismiss — priming never applies to that path regardless (see AudioScene.tsx's own doc
 *  comment on `TextAnchorAudioScene`). */
async function playThenDismissAudioScene(user: ReturnType<typeof userEvent.setup>) {
  if (document.querySelector('.speech-bubble')) {
    await dismissAudioScene(user);
    return;
  }
  const buttons = document.querySelectorAll('[data-audio-role] button');
  await user.click(buttons[0] as HTMLElement); // さいせいする
  await user.click(buttons[buttons.length - 1] as HTMLElement); // continue, mid/after playback
}

/**
 * Architect-resolved completion-ritual behaviour #1: M0 now fires automatically right after
 * every profile is created/chosen, before Course Home — src/shell/MissionShell.tsx's
 * `afterProfileChosen`. Every existing test's own profile-creation flow needs this tap to reach
 * Course Home at all; exported so each test file's own local `createProfile` helper can call it
 * right after the profile-confirm tap, same "one shared tap sequence" pattern as
 * `skipPrePracticeAudioIfPresent`. A no-op if M0 is already sealed (nothing to tap).
 */
export async function skipM0RitualIfPresent(user: ReturnType<typeof userEvent.setup>, ui: ModuleUiStrings) {
  const sealButton = screen.queryByText(ui.m0Action);
  if (sealButton) await user.click(sealButton);
}

/**
 * WO-33 (AD-10 / Audio Reference Scripts rev.3): a mission with its own registered pre-practice
 * MODEL/GUIDED audio (src/audio/registry.ts, reached via `chooseCoop` for both solo and co-play)
 * shows that screen before the real practice stage ever appears. A no-op for every mission whose
 * own registered audio (if it has one at all) plays somewhere else instead — CHECKPOINT (after
 * teach-back/M2b, see `skipCheckpointAudioIfPresent`) or TRANSFER/'independent practice' (right
 * after the child's own work, see `skipPostWorkAudioIfPresent`), which never render
 * `[data-audio-role]` at this point in the flow. Exported so tests/Mission1Stage.test.tsx's own
 * `enterStage` (chanto/MODEL) can reuse the exact same tap sequence instead of a second copy.
 */
export async function skipPrePracticeAudioIfPresent(user: ReturnType<typeof userEvent.setup>) {
  if (!document.querySelector('[data-audio-role]')) return;
  await dismissAudioScene(user);
  await waitFor(() => expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument());
}

/** Builder work order §5: the "actually played" counterpart of `skipPrePracticeAudioIfPresent` —
 *  same no-op-if-absent contract, but presses play first so priming (demonstratedLayers) applies
 *  for this attempt. Use this, not the skip variant, whenever a test's own point is to exercise
 *  what happens once a mission's reference audio was genuinely heard. */
export async function playPrePracticeAudioIfPresent(user: ReturnType<typeof userEvent.setup>) {
  if (!document.querySelector('[data-audio-role]')) return;
  await playThenDismissAudioScene(user);
  await waitFor(() => expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument());
}

/**
 * Final Module 1 Audio Integration Pass: the 'post-ungated' counterpart of
 * `skipPrePracticeAudioIfPresent`/`skipCheckpointAudioIfPresent` — a mission with its own
 * registered TRANSFER (every Bank Dig) or 'independent practice' (Story 1-6/zurui) audio shows
 * this screen immediately after the child's own work (`MissionStage`'s onComplete, reached via
 * `stageCompleted`), in BOTH solo and co-play — never gated behind teach-back/M2b the way
 * CHECKPOINT is. A no-op for every other mission. Callers must await this before asserting on
 * whatever screen follows completion (course-complete, the completion ritual, or the co-play
 * handoff curtain), same contract as the other two skip*IfPresent audio helpers.
 *
 * Unlike those two (both reached synchronously from a plain button onClick), this one is reached
 * from `MissionStage`'s own completion animation — a real `setTimeout(() => onComplete(result),
 * 480)` — so a bare synchronous DOM check immediately after the triggering tap can race it and
 * wrongly conclude "no audio" before it has actually rendered. Waits briefly for it to possibly
 * appear first; a mission with none genuinely never satisfies this and the catch makes that the
 * ordinary no-op case, same as the other two helpers'.
 */
export async function skipPostWorkAudioIfPresent(user: ReturnType<typeof userEvent.setup>) {
  try {
    await waitFor(() => expect(document.querySelector('[data-audio-role]')).toBeInTheDocument(), { timeout: 800 });
  } catch {
    return; // this mission has no 'post-ungated' audio — the ordinary case for every Story.
  }
  await dismissAudioScene(user);
  await waitFor(() => expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument());
}

/**
 * WO-33: the CHECKPOINT counterpart of `skipPrePracticeAudioIfPresent` — reached only from
 * 'stage-teachback's own return-to-child tap (after teach-back and M2b), for a mission with its
 * own registered CHECKPOINT script (oyatsu/1-4, today). A no-op for every other mission, whose
 * return-to-child tap goes straight to Mission Complete exactly as before this ticket. Callers
 * must await this BEFORE asserting on `ui.completeHeading`.
 */
export async function skipCheckpointAudioIfPresent(user: ReturnType<typeof userEvent.setup>, ui?: ModuleUiStrings) {
  // Builder work order §4: solo now passes through 'solo-checkpoint-offer' (a single existing
  // teachbackSkip/「あとでやる」 button) on its way to the same CHECKPOINT audio screen the
  // co-play path reaches from 'stage-teachback' — tap through it first if present. Every
  // pre-existing (co-play) caller never sees that screen at all, so omitting `ui` is a no-op for
  // them; only a solo-CHECKPOINT test needs to pass it. Reached via MissionStage's own real
  // `setTimeout(() => onComplete(result), 480)` completion animation (same race
  // `skipPostWorkAudioIfPresent` above already guards against), so a bare synchronous query can
  // run before the offer screen has actually appeared.
  if (ui) {
    let soloOffer: HTMLElement | null = null;
    try {
      await waitFor(() => { soloOffer = screen.getByText(ui.teachbackSkip); }, { timeout: 800 });
    } catch { /* this mission/path never shows the solo offer — the ordinary case. */ }
    if (soloOffer) await user.click(soloOffer);
  }
  if (!document.querySelector('[data-audio-role="CHECKPOINT"]')) return;
  await dismissAudioScene(user);
}

/**
 * WO-34: the same "reached only from 'stage-teachback's own return-to-child tap" slot as
 * `skipCheckpointAudioIfPresent` above, for Story 1-8 (randoseru)'s own optional Real AI Lab —
 * a no-op for every other mission. Callers must await this BEFORE asserting on
 * `ui.completeHeading`, same contract as the CHECKPOINT helper.
 */
export async function skipRealAiLabIfPresent(user: ReturnType<typeof userEvent.setup>, ui: ModuleUiStrings) {
  if (!document.querySelector('.mission-shell__real-ai-lab-heading')) return;
  await user.click(screen.getByText(ui.handoffSkip));
}

/**
 * Architect-resolved completion-ritual behaviours #2-#7: the required ritual after Story 1-8,
 * reached from Real AI Lab's own onContinue (tried or skipped) or, in solo play, directly from
 * `stageCompleted`. A no-op for every other mission. All three of its steps ('write' / 'compare'
 * / 'certificate') share the same `ui.handoffContinue` advance action — this drives through all
 * three in order, waiting for each step's own distinctive content before the next tap, same
 * "content-agnostic, one shared tap sequence" pattern as this file's other skip*IfPresent
 * helpers. Leaves the caller on whatever `onDone` leads to (the existing course-complete
 * `MissionComplete` screen, unchanged).
 */
export async function skipCompletionRitualIfPresent(user: ReturnType<typeof userEvent.setup>, ui: ModuleUiStrings) {
  if (!document.querySelector('.mission-shell__completion-ritual')) return;
  await user.click(screen.getByText(ui.handoffContinue)); // 'write' -> 'compare'
  await waitFor(() => expect(screen.getByText(ui.m0ParentForward ?? '')).toBeInTheDocument());
  await user.click(screen.getByText(ui.handoffContinue)); // 'compare' -> 'certificate'
  await waitFor(() => expect(screen.getByText(ui.certificateHeading ?? '')).toBeInTheDocument());
  await user.click(screen.getByText(ui.handoffContinue)); // 'certificate' -> onDone
}

/**
 * WO-26 §25/§26/§27: drives a mission end to end through the real `MissionShell` tree (profile
 * already picked, coop question already answered — the caller owns getting there and whatever
 * comes after completion), reused by both the sampled solo-safety/co-play conformance tests
 * (tests/GoldenConformance.test.tsx) and the full-course journey regression
 * (tests/FullCourseJourney.test.tsx). Content-agnostic, ruby-safe, and skips any mid-mission
 * prediction battle it meets along the way (harmless in SOLO, where it already auto-skips;
 * required in CO-PLAY).
 */
export async function playMissionScreenToCompletion(
  user: ReturnType<typeof userEvent.setup>,
  mission: Mission,
  ui: ModuleUiStrings,
) {
  const digPhase = mission.phases.find((p) => p.template === 'dig') as DigPhase;
  const slotPhase = mission.phases.find((p) => p.template === 'slot-assembly') as SlotAssemblyPhase | undefined;

  await skipPrePracticeAudioIfPresent(user);

  if (slotPhase) {
    const clearCard = slotPhase.cards.find((c) => c.tag === 'clear')!;
    await waitFor(() => {
      expect(screen.queryByText(renderedText(clearCard.text)) ?? screen.queryByText(ui.predictionSkip)).toBeTruthy();
    });
    await skipBattleIfPresent(user, ui);
    await waitFor(() => expect(getByAuthoredText(clearCard.text)).toBeInTheDocument());
    await user.click(getByAuthoredText(clearCard.text));
    await waitFor(() => expect(getByAuthoredText(digPhase.layers[0]!.robotSays)).toBeInTheDocument());
    await user.click(getByAuthoredText(digPhase.layers[0]!.robotSays));
  } else {
    await waitFor(() => expect(getByAuthoredText(digPhase.layers[0]!.robotSays)).toBeInTheDocument());
    await user.click(getByAuthoredText(digPhase.layers[0]!.robotSays));
  }

  for (let i = 0; i < digPhase.layers.length; i++) {
    const layer = digPhase.layers[i]!;
    await waitFor(() => {
      expect(screen.queryByText(ui.judgeNotEnough) ?? screen.queryByText(ui.predictionSkip)).toBeTruthy();
    });
    await skipBattleIfPresent(user, ui);
    await waitFor(() => expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument());
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [gapChoice] = document.querySelectorAll('.ad12-recess .ad12-slip');
    await user.click(gapChoice as HTMLElement);
    // Blind-first (WO-07): once a layer's single deepen move has reached `tsukaeru` on this
    // profile (real, accumulated moveProgress — this helper is also used across a long,
    // multi-mission real playthrough, e.g. tests/FullCourseJourney.test.tsx), Gap Naming opens
    // straight into a blind commit ("いえた") instead of the hand — genuine reduced-guidance
    // behavior (§12), not a defect. Commit it, then proceed to the real hand exactly as before
    // (it renders alongside the resulting self-report chips, unaffected by them).
    const blindCommitButton = screen.queryByText(ui.blindCommit);
    if (blindCommitButton) await user.click(blindCommitButton);
    const deepen = layer.hand.find((c) => c.tag === 'deepen')!;
    await waitFor(() => expect(getByAuthoredText(deepen.text)).toBeInTheDocument());
    await user.click(getByAuthoredText(deepen.text));
    await waitFor(() => expect(document.querySelector('.stage__hand-tray')).not.toBeInTheDocument());
    if (i === digPhase.layers.length - 1) {
      await waitFor(() => expect(screen.getByText(ui.stageRootDiscoveryLabel)).toBeInTheDocument());
      // AD-12 cutover: see the matching comment in playMissionStageToCompletion above.
      await user.click(document.querySelector(ADVANCE_SELECTOR) as HTMLElement);
    } else {
      await waitFor(() => expect(document.querySelector('.speech-bubble')).toBeInTheDocument());
      await user.click(document.querySelector('.speech-bubble') as HTMLElement);
    }
  }
  await waitFor(() => expect(screen.getByText(ui.stageNextLabel)).toBeInTheDocument());
  await user.click(screen.getByText(ui.stageNextLabel));
}
