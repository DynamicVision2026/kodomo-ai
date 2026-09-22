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
        expect(getByAuthoredText(nonClear.text).closest('.question-chip')!.className).toContain('is-blocked');
      });
      expect(within(getByAuthoredText(nonClear.text).closest('.question-chip') as HTMLElement).getByText('🪨')).toBeInTheDocument();
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

    // §10: GAP Naming explicitly names the decision.
    expect(screen.getByText(ui.stageGapPrompt)).toBeInTheDocument();
    const [gapChoice] = document.querySelectorAll('.choice-tray .question-chip');
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
          expect(getByAuthoredText(nonDeepen.text).closest('.question-chip')!.className).toContain('is-blocked');
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
      const rootBubble = document.querySelector('.speech-bubble') as HTMLElement;
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
 * WO-33 (AD-10 / Audio Reference Scripts rev.3): a mission with its own registered pre-practice
 * MODEL/GUIDED audio (src/audio/registry.ts, reached via `chooseCoop` for both solo and co-play)
 * shows that screen — one framing bubble, then the mission's own robotSays bubble — before the
 * real practice stage ever appears. A no-op for every one of the other 18 missions, which never
 * render `[data-audio-role]` at all. Exported so tests/Mission1Stage.test.tsx's own `enterStage`
 * (chanto/MODEL) can reuse the exact same tap sequence instead of a second copy of it.
 */
export async function skipPrePracticeAudioIfPresent(user: ReturnType<typeof userEvent.setup>) {
  if (!document.querySelector('[data-audio-role]')) return;
  await user.click(document.querySelector('.speech-bubble') as HTMLElement); // the listen prompt
  await waitFor(() => expect(document.querySelector('.speech-bubble')).toBeInTheDocument());
  await user.click(document.querySelector('.speech-bubble') as HTMLElement); // the robotSays anchor
  await waitFor(() => expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument());
}

/**
 * WO-33: the CHECKPOINT counterpart of `skipPrePracticeAudioIfPresent` — reached only from
 * 'stage-teachback's own return-to-child tap (after teach-back and M2b), for a mission with its
 * own registered CHECKPOINT script (oyatsu/1-4, today). A no-op for every other mission, whose
 * return-to-child tap goes straight to Mission Complete exactly as before this ticket. Callers
 * must await this BEFORE asserting on `ui.completeHeading`.
 */
export async function skipCheckpointAudioIfPresent(user: ReturnType<typeof userEvent.setup>) {
  if (!document.querySelector('[data-audio-role="CHECKPOINT"]')) return;
  await user.click(document.querySelector('.speech-bubble') as HTMLElement); // the listen prompt
  await waitFor(() => expect(document.querySelector('.speech-bubble')).toBeInTheDocument());
  await user.click(document.querySelector('.speech-bubble') as HTMLElement); // the robotSays anchor
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
    const [gapChoice] = document.querySelectorAll('.choice-tray .question-chip');
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
      await user.click(document.querySelector('.speech-bubble') as HTMLElement);
    } else {
      await waitFor(() => expect(document.querySelector('.speech-bubble')).toBeInTheDocument());
      await user.click(document.querySelector('.speech-bubble') as HTMLElement);
    }
  }
  await waitFor(() => expect(screen.getByText(ui.stageNextLabel)).toBeInTheDocument());
  await user.click(screen.getByText(ui.stageNextLabel));
}
