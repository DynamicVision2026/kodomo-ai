import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { MissionStage } from '../src/stage/MissionStage';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import type { AppState } from '../src/engine/storage';
import {
  playMissionStageToCompletion, playMissionScreenToCompletion,
  skipPrePracticeAudioIfPresent, playPrePracticeAudioIfPresent, skipCheckpointAudioIfPresent, skipM0RitualIfPresent,
} from './helpers/stageConformance';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanJson from '../src/modules/m1/topics/genkan/s2.json';
import oyatsuJson from '../src/modules/m1/topics/oyatsu/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;
const chanto = chantoJson as unknown as Mission;
const genkan = genkanJson as unknown as Mission;
const oyatsu = oyatsuJson as unknown as Mission;

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

async function createProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
  await skipM0RitualIfPresent(user, ui);
}

/** Renders a single mission directly (no library), matching tests/Mission1Stage.test.tsx's own
 *  pattern — familyTestMode so entitlement never blocks entry, opted into the continuous stage
 *  (every real Story/Bank Dig's own production wiring) so `chooseCoop` can ever reach 'audio'. */
function renderSingleMission(mission: Mission) {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={[]} mission={mission} ui={ui} familyTestMode
      followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      continuousStageMissionIds={new Set([mission.id])}
    />,
  );
}

/**
 * WO-33 (AD-10 / Audio Reference Scripts rev.3): the Audio Reference Slice — 1-1 (chanto/MODEL),
 * 1-2 (genkan/GUIDED), 1-4 (oyatsu/CHECKPOINT) only. Three concerns, each required by the WO's
 * own verification section: placement/order, 1-1's demonstrated-layer growth suppression (and
 * its resumption on the first non-demonstrated layer), and 1-4 staying genuinely unprimed.
 */
describe('WO-33 — Audio Reference Slice: placement/order', () => {
  it('1-1 (chanto/MODEL): its own audio plays before practice, for both solo and co-play', async () => {
    for (const coopLabel of [ui.coopSolo, ui.coopYes]) {
      const user = userEvent.setup();
      renderSingleMission(chanto);
      await createProfile(user);
      await user.click(screen.getByText(ui.courseHomeContinueLabel));
      await user.click(screen.getByText(coopLabel));

      expect(document.querySelector('[data-audio-role="MODEL"]')).toBeInTheDocument();
      expect(screen.queryByText(ui.stageQuestionPrompt)).not.toBeInTheDocument(); // practice hasn't started

      await skipPrePracticeAudioIfPresent(user);
      expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
      // Co-play only: chanto's own opening prediction battle (not auto-skipped like solo).
      const skip = screen.queryByText(ui.predictionSkip);
      if (skip) await user.click(skip);
      expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument(); // now the real stage
      cleanup();
    }
  });

  it('1-2 (genkan/GUIDED): its own audio plays before practice too', async () => {
    const user = userEvent.setup();
    renderSingleMission(genkan);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));

    expect(document.querySelector('[data-audio-role="GUIDED"]')).toBeInTheDocument();
    expect(screen.queryByText(ui.stageQuestionPrompt)).not.toBeInTheDocument();

    await skipPrePracticeAudioIfPresent(user);
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument();
  });

  it('1-4 (oyatsu/CHECKPOINT): never appears before or during practice — only after teach-back and M2b, in co-play', async () => {
    const user = userEvent.setup();
    renderSingleMission(oyatsu);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopYes));

    // No pre-practice audio at all for a CHECKPOINT mission — straight into real practice
    // (oyatsu's own opening prediction battle, co-play only, comes before the question prompt).
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    const skip = await screen.findByText(ui.predictionSkip);
    await user.click(skip);
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument();

    await playMissionScreenToCompletion(user, oyatsu, ui);

    // Root reached, きょうのコツ read — still not shown before the handoff/teach-back beats.
    await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.stageHandoffGiven));

    // Teach-back is showing, but M2b hasn't been confirmed yet — still not shown.
    await waitFor(() => expect(screen.getByText(oyatsu.teachBack)).toBeInTheDocument());
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.stageParentGotItLabel)); // M2b confirmation

    // M2b just confirmed, but the family hasn't tapped "return to child" yet — still not shown.
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    expect(screen.getByText(ui.stageReturnToChild)).toBeInTheDocument();

    // Only NOW — strictly after the child's own work, teach-back, and M2b — does it appear.
    await user.click(screen.getByText(ui.stageReturnToChild));
    expect(document.querySelector('[data-audio-role="CHECKPOINT"]')).toBeInTheDocument();

    await skipCheckpointAudioIfPresent(user);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });

  it('1-4 (oyatsu/CHECKPOINT) in SOLO: no teach-back/M2b, but a single 「あとでやる」 tap still reaches and completes its comparison audio (Builder work order §4)', async () => {
    const user = userEvent.setup();
    renderSingleMission(oyatsu);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();

    await playMissionScreenToCompletion(user, oyatsu, ui);
    // No teach-back/M2b in solo — straight to the single deferral tap instead of 'complete'.
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    await skipCheckpointAudioIfPresent(user, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });
});

describe('WO-33 — 1-1 demonstrated-layer growth suppression (rev.3 §E)', () => {
  it('layer 0 (demonstrated by the MODEL audio) writes no use/apt_use evidence at all', async () => {
    const user = userEvent.setup();
    const { onUse } = await playMissionStageToCompletion(user, chanto, ui, { demonstratedLayers: new Set([0]) });

    // Not one onUse call — deepen or otherwise — was ever reported for layer 0.
    expect(onUse.mock.calls.some(([e]) => e.layerIndex === 0)).toBe(false);
  });

  it('layer 1 (not demonstrated) resumes ordinary growth recording — a real apt_use, with its own move', async () => {
    const user = userEvent.setup();
    const { onUse } = await playMissionStageToCompletion(user, chanto, ui, { demonstratedLayers: new Set([0]) });

    const layer1AptUse = onUse.mock.calls.find(([e]) => e.layerIndex === 1 && e.aptUse);
    expect(layer1AptUse).toBeTruthy();
    expect(layer1AptUse![0].move).toBe('follow-tatoeba'); // chanto's own authored layer-1 deepen move
  });

  it('without demonstratedLayers (every other mission today), layer 0 still records normally — proves the suppression is opt-in, not a global change', async () => {
    const user = userEvent.setup();
    const { onUse } = await playMissionStageToCompletion(user, chanto, ui); // no demonstratedLayers at all

    // Unlike the demonstratedLayers:[0] case above (zero onUse calls for layer 0, ever), the
    // ordinary path plays a non-deepen card at layer 0 first (this same helper's own recovery
    // check) before its deepen — at least that play must still be reported.
    expect(onUse.mock.calls.some(([e]) => e.layerIndex === 0)).toBe(true);
  });

  /**
   * The three tests above (already passing before this ticket) only ever proved onUse — the
   * deepen hand-card commit at the END of a layer's round. Gap Naming, earlier in that SAME
   * primed round (JUDGE -> GAP NAMING -> hand), has its own two evidence calls — onGapNamed
   * (M2a proxy evidence) and onMoveRendered (a real mihakken -> moratta rung transition,
   * src/engine/scaffold.ts's own applyMoveRendered, plus an M1 re-evaluation) — and Blind-first
   * has a third, onBlindCommit (tsukaeru -> hitoride, plus M4/memory evidence). None of the
   * three were ever gated by `demonstratedLayers` before this ticket: src/stage/MissionStage.tsx
   * called all of them unconditionally in `gapChosen`/`blindCommitTapped`, so a demonstrated
   * layer's own Gap Naming step silently wrote real progression evidence regardless of `onUse`'s
   * own, correctly-guarded suppression later in the same round.
   */
  it('Gap Naming at layer 0 (demonstrated) writes no onGapNamed/onMoveRendered evidence either — not just onUse', async () => {
    const user = userEvent.setup();
    const onGapNamed = vi.fn();
    const onMoveRendered = vi.fn();
    render(
      <MissionStage
        mission={chanto} ui={ui} solo
        moveProgress={{}} guidanceUses={{}}
        onGuidanceUse={() => {}} onMoveRendered={onMoveRendered} onUse={() => {}}
        onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={onGapNamed}
        onComplete={() => {}}
        demonstratedLayers={new Set([0])}
      />,
    );
    const slotPhase = chanto.phases.find((p) => p.template === 'slot-assembly') as any;
    const digPhase = chanto.phases.find((p) => p.template === 'dig') as any;
    const clearCard = slotPhase.cards.find((c: any) => c.tag === 'clear');
    await waitFor(() => expect(screen.getByText(clearCard.text)).toBeInTheDocument());
    await user.click(screen.getByText(clearCard.text));
    await waitFor(() => expect(screen.getByText(digPhase.layers[0].robotSays)).toBeInTheDocument());
    await user.click(screen.getByText(digPhase.layers[0].robotSays));
    await waitFor(() => expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument());
    await user.click(screen.getByText(ui.judgeNotEnough));
    await waitFor(() => expect(screen.getByText(ui.stageGapPrompt)).toBeInTheDocument());
    const [gapChoice] = document.querySelectorAll('.ad12-recess .ad12-slip');
    await user.click(gapChoice as HTMLElement);

    await waitFor(() => expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument()); // the hand tray, reached
    expect(onGapNamed).not.toHaveBeenCalled();
    expect(onMoveRendered).not.toHaveBeenCalled();
  });

  it('Gap Naming at layer 1 (not demonstrated) resumes ordinary onGapNamed/onMoveRendered recording — contrast proving the suppression above is per-layer, not global', async () => {
    const user = userEvent.setup();
    const onGapNamed = vi.fn();
    const onMoveRendered = vi.fn();
    render(
      <MissionStage
        mission={chanto} ui={ui} solo
        moveProgress={{}} guidanceUses={{}}
        onGuidanceUse={() => {}} onMoveRendered={onMoveRendered} onUse={() => {}}
        onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={onGapNamed}
        onComplete={() => {}}
        demonstratedLayers={new Set([0])}
      />,
    );
    const slotPhase = chanto.phases.find((p) => p.template === 'slot-assembly') as any;
    const digPhase = chanto.phases.find((p) => p.template === 'dig') as any;
    const clearCard = slotPhase.cards.find((c: any) => c.tag === 'clear');
    await waitFor(() => expect(screen.getByText(clearCard.text)).toBeInTheDocument());
    await user.click(screen.getByText(clearCard.text));
    await waitFor(() => expect(screen.getByText(digPhase.layers[0].robotSays)).toBeInTheDocument());
    await user.click(screen.getByText(digPhase.layers[0].robotSays));
    // Layer 0: JUDGE -> GAP NAMING -> deepen, straight through (demonstrated, so no evidence).
    await waitFor(() => expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument());
    await user.click(screen.getByText(ui.judgeNotEnough));
    await waitFor(() => expect(screen.getByText(ui.stageGapPrompt)).toBeInTheDocument());
    await user.click(document.querySelectorAll('.ad12-recess .ad12-slip')[0] as HTMLElement);
    const layer0Deepen = digPhase.layers[0].hand.find((c: any) => c.tag === 'deepen');
    await waitFor(() => expect(screen.getByText(layer0Deepen.text)).toBeInTheDocument());
    await user.click(screen.getByText(layer0Deepen.text));
    await waitFor(() => expect(document.querySelector('.stage__hand-tray')).not.toBeInTheDocument());
    expect(onGapNamed).not.toHaveBeenCalled();
    expect(onMoveRendered).not.toHaveBeenCalled();

    // Layer 1's own opening line, then its own JUDGE -> GAP NAMING (not demonstrated).
    await waitFor(() => expect(document.querySelector('.speech-bubble')).toBeInTheDocument());
    await user.click(document.querySelector('.speech-bubble') as HTMLElement);
    await waitFor(() => expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument());
    await user.click(screen.getByText(ui.judgeNotEnough));
    await waitFor(() => expect(screen.getByText(ui.stageGapPrompt)).toBeInTheDocument());
    await user.click(document.querySelectorAll('.ad12-recess .ad12-slip')[0] as HTMLElement);

    expect(onGapNamed).toHaveBeenCalledTimes(1);
    expect(onGapNamed).toHaveBeenCalledWith({ missionId: chanto.id });
    expect(onMoveRendered).toHaveBeenCalledWith('follow-tatoeba'); // chanto's own authored layer-1 deepen move
  });

  it('Blind-first at layer 0 (demonstrated) writes no onBlindCommit evidence either, even when a move already at tsukaeru (from other missions) makes it eligible', async () => {
    const user = userEvent.setup();
    const onBlindCommit = vi.fn();
    const onMoveRendered = vi.fn();
    render(
      <MissionStage
        mission={chanto} ui={ui} solo
        // "follow-tsumari" (chanto's own layer-0 deepen move) is already tsukaeru — as it would
        // be for a returning profile that reached it via other missions first. This is exactly
        // what makes Blind-first eligible on the very FIRST visit to a demonstrated layer.
        moveProgress={{ 'follow-tsumari': { rung: 'tsukaeru', aptUseDomains: ['a', 'b', 'c'] } }}
        guidanceUses={{}}
        onGuidanceUse={() => {}} onMoveRendered={onMoveRendered} onUse={() => {}}
        onBlindCommit={onBlindCommit} onBlindSelfReport={() => {}} onGapNamed={() => {}}
        onComplete={() => {}}
        demonstratedLayers={new Set([0])}
      />,
    );
    const slotPhase = chanto.phases.find((p) => p.template === 'slot-assembly') as any;
    const digPhase = chanto.phases.find((p) => p.template === 'dig') as any;
    const clearCard = slotPhase.cards.find((c: any) => c.tag === 'clear');
    await waitFor(() => expect(screen.getByText(clearCard.text)).toBeInTheDocument());
    await user.click(screen.getByText(clearCard.text));
    await waitFor(() => expect(screen.getByText(digPhase.layers[0].robotSays)).toBeInTheDocument());
    await user.click(screen.getByText(digPhase.layers[0].robotSays));
    await waitFor(() => expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument());
    await user.click(screen.getByText(ui.judgeNotEnough));
    await waitFor(() => expect(screen.getByText(ui.stageGapPrompt)).toBeInTheDocument());
    await user.click(document.querySelectorAll('.ad12-recess .ad12-slip')[0] as HTMLElement);

    // Blind-first's own commit chip ("いえた") replaces the ordinary hand tray when eligible.
    const blindCommitButton = await screen.findByText(ui.blindCommit!);
    await user.click(blindCommitButton);

    expect(onBlindCommit).not.toHaveBeenCalled();
    expect(onMoveRendered).not.toHaveBeenCalled(); // Gap Naming's own call, same round
  });

  /**
   * End-to-end proof through the real production wiring (src/shell/MissionShell.tsx's own
   * moveRendered/gapNamed — not a directly-injected spy), confirming the guard above actually
   * reaches the persisted profile: `demonstratedLayers` comes from chanto's own registered
   * MODEL script (src/audio/registry.ts), exactly as main.tsx wires it in production — no test-
   * only shortcut.
   */
  it('end-to-end through the real MissionShell: after layer 0 (demonstrated), the persisted profile has no moveProgress or m2Evidence at all', async () => {
    const user = userEvent.setup();
    renderSingleMission(chanto);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    // Builder work order §5: this test's own point is the DEMONSTRATED case, which now requires
    // the audio to have actually been played (not merely visited/skipped) — see this file's own
    // new "skip without playing" test below for the companion NOT-demonstrated case.
    await playPrePracticeAudioIfPresent(user);

    const slotPhase = chanto.phases.find((p) => p.template === 'slot-assembly') as any;
    const digPhase = chanto.phases.find((p) => p.template === 'dig') as any;
    const clearCard = slotPhase.cards.find((c: any) => c.tag === 'clear');
    await waitFor(() => expect(screen.getByText(clearCard.text)).toBeInTheDocument());
    await user.click(screen.getByText(clearCard.text));
    await waitFor(() => expect(screen.getByText(digPhase.layers[0].robotSays)).toBeInTheDocument());
    await user.click(screen.getByText(digPhase.layers[0].robotSays));
    await waitFor(() => expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument());
    await user.click(screen.getByText(ui.judgeNotEnough));
    await waitFor(() => expect(screen.getByText(ui.stageGapPrompt)).toBeInTheDocument());
    await user.click(document.querySelectorAll('.ad12-recess .ad12-slip')[0] as HTMLElement);
    const layer0Deepen = digPhase.layers[0].hand.find((c: any) => c.tag === 'deepen');
    await waitFor(() => expect(screen.getByText(layer0Deepen.text)).toBeInTheDocument());
    await user.click(screen.getByText(layer0Deepen.text));
    await waitFor(() => expect(document.querySelector('.stage__hand-tray')).not.toBeInTheDocument());

    const saved: AppState = JSON.parse(localStorage.getItem('m-app.v2')!);
    const profile = saved.profiles[0]!;
    expect(profile.moveProgress?.['follow-tsumari']).toBeUndefined(); // never rendered/used
    expect(profile.milestones?.M1).toBeUndefined(); // no rung ever advanced to re-evaluate from
    expect(profile.m2Evidence?.proxyMissionIds ?? []).not.toContain(chanto.id); // no Gap Naming credit
  });

  /**
   * Builder work order §5 ("1-1 audio priming — verify before modifying"): the companion NOT-
   * demonstrated case. Before this fix, `demonstratedLayers` applied unconditionally to any
   * mission with a registered MODEL script, so tapping straight past the audio screen without
   * ever pressing play still suppressed layer 0's evidence — exactly the bug this test guards
   * against regressing to. Same real MissionShell wiring as the test above, same layer-0 play,
   * only difference is `skipPrePracticeAudioIfPresent` (never presses さいせいする) instead of
   * `playPrePracticeAudioIfPresent`.
   */
  it('end-to-end through the real MissionShell: layer 0 is NOT demonstrated when the audio screen is skipped without ever pressing play', async () => {
    const user = userEvent.setup();
    renderSingleMission(chanto);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await skipPrePracticeAudioIfPresent(user);

    const slotPhase = chanto.phases.find((p) => p.template === 'slot-assembly') as any;
    const digPhase = chanto.phases.find((p) => p.template === 'dig') as any;
    const clearCard = slotPhase.cards.find((c: any) => c.tag === 'clear');
    await waitFor(() => expect(screen.getByText(clearCard.text)).toBeInTheDocument());
    await user.click(screen.getByText(clearCard.text));
    await waitFor(() => expect(screen.getByText(digPhase.layers[0].robotSays)).toBeInTheDocument());
    await user.click(screen.getByText(digPhase.layers[0].robotSays));
    await waitFor(() => expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument());
    await user.click(screen.getByText(ui.judgeNotEnough));
    await waitFor(() => expect(screen.getByText(ui.stageGapPrompt)).toBeInTheDocument());
    await user.click(document.querySelectorAll('.ad12-recess .ad12-slip')[0] as HTMLElement);
    const layer0Deepen = digPhase.layers[0].hand.find((c: any) => c.tag === 'deepen');
    await waitFor(() => expect(screen.getByText(layer0Deepen.text)).toBeInTheDocument());
    await user.click(screen.getByText(layer0Deepen.text));
    await waitFor(() => expect(document.querySelector('.stage__hand-tray')).not.toBeInTheDocument());

    const saved: AppState = JSON.parse(localStorage.getItem('m-app.v2')!);
    const profile = saved.profiles[0]!;
    // Normal evidence recording — the OPPOSITE of the demonstrated case above.
    expect(profile.moveProgress?.['follow-tsumari']).toBeDefined();
    expect(profile.m2Evidence?.proxyMissionIds ?? []).toContain(chanto.id);
  });
});

/**
 * Builder work order §4 ("CHECKPOINT audio — fix solo completion", acceptance §7F) + correction
 * (1): a child plays 1-4 (oyatsu) solo, defers teach-back via 「あとでやる」, actually hears the
 * CHECKPOINT comparison audio, and completes the mission. A parent LATER opens the parent
 * dashboard and confirms teach-back there — proving `confirmM2b`/`addStamp` correctly tag that
 * confirmation `afterCompare: true` end to end through the real MissionShell, not a direct
 * milestones.ts unit call.
 *
 * WO-27 §11's own hardened invariant (see WO27ProgressionConsistency.test.tsx's own "parent
 * isolation" test) is that `mission` is only reliably "what this confirmation is actually for"
 * when the dashboard is reached via a genuine just-finished-mission context
 * (`screen.afterMission === true` — MissionComplete's own 「おうちで やってみる」/
 * completeTryOutsideLabel button, used below), never when opened independently from Course
 * Home's standing 「おうちの方へ」 button. Both paths are covered here.
 */
describe('Builder work order §4 — CHECKPOINT solo completion: afterCompare end to end', () => {
  it('solo あとでやる + actually-played comparison audio, then a LATER M2b confirmation via the just-finished-mission dashboard path (おうちで やってみる), is tagged afterCompare: true', async () => {
    const user = userEvent.setup();
    renderSingleMission(oyatsu);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, oyatsu, ui);

    // No teach-back/M2b yet — defer, then actually press play (not skip) on the comparison audio.
    await waitFor(() => expect(screen.getByText(ui.teachbackSkip)).toBeInTheDocument());
    await user.click(screen.getByText(ui.teachbackSkip));
    await waitFor(() => expect(document.querySelector('[data-audio-role="CHECKPOINT"]')).toBeInTheDocument());
    const audioButtons = document.querySelectorAll('[data-audio-role] button');
    await user.click(audioButtons[0] as HTMLElement); // さいせいする — actually played
    await user.click(audioButtons[audioButtons.length - 1] as HTMLElement); // continue
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());

    let saved: AppState = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved.profiles[0]!.checkpointAudioHeard).toContain(oyatsu.id);
    expect(saved.profiles[0]!.milestones?.M2).toBeUndefined(); // no teach-back given yet
    expect(saved.profiles[0]!.progress[oyatsu.id]?.afterCompare).toBeUndefined(); // no stamp yet either

    // LATER, still on the 'complete' screen for oyatsu: 「おうちで やってみる」 — the ONE path
    // that reaches the dashboard with a real, mission-attributed context (afterMission: true).
    await user.click(screen.getByText(ui.completeTryOutsideLabel!));
    await waitFor(() => expect(screen.getByText(ui.m2ConfirmAction)).toBeInTheDocument());
    await user.click(screen.getByText(ui.m2ConfirmAction));

    saved = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved.profiles[0]!.milestones!.M2).toEqual({ achieved: true, achievedAt: expect.any(Number), afterCompare: true });
    // The per-mission teach-back record (correction 1) — not just the once-ever M2 milestone.
    expect(saved.profiles[0]!.progress[oyatsu.id]).toEqual({ done: true, stamps: 1, coop: false, afterCompare: true });
  });

  it('the SAME facts, but confirmed from the standing dashboard opened independently (not just-finished), is NOT attributed afterCompare — WO-27\'s own "mission may be unrelated" invariant', async () => {
    const user = userEvent.setup();
    renderSingleMission(oyatsu);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, oyatsu, ui);
    await waitFor(() => expect(screen.getByText(ui.teachbackSkip)).toBeInTheDocument());
    await user.click(screen.getByText(ui.teachbackSkip));
    await waitFor(() => expect(document.querySelector('[data-audio-role="CHECKPOINT"]')).toBeInTheDocument());
    const audioButtons = document.querySelectorAll('[data-audio-role] button');
    await user.click(audioButtons[0] as HTMLElement);
    await user.click(audioButtons[audioButtons.length - 1] as HTMLElement);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());

    const saved1: AppState = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved1.profiles[0]!.checkpointAudioHeard).toContain(oyatsu.id); // the fact IS recorded…

    // …but confirming from the INDEPENDENTLY-opened dashboard (back to map, then Course Home's
    // own standing button) must not attribute it to `mission`, which is unreliable there.
    await user.click(screen.getByText(ui.completeBackToMapLabel));
    await user.click(screen.getByText(ui.parentScreenHeading));
    await waitFor(() => expect(screen.getByText(ui.m2ConfirmAction)).toBeInTheDocument());
    await user.click(screen.getByText(ui.m2ConfirmAction));

    const saved2: AppState = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved2.profiles[0]!.milestones!.M2).toEqual({ achieved: true, achievedAt: expect.any(Number), afterCompare: false });
    // No per-mission stamp was written for oyatsu from this path either.
    expect(saved2.profiles[0]!.progress[oyatsu.id]?.stamps ?? 0).toBe(0);
  });
});
