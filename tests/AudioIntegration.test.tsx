import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import { audioScriptFor } from '../src/audio/registry';
import { audioPlacement } from '../src/audio/types';
import {
  playMissionScreenToCompletion, skipCheckpointAudioIfPresent, skipM0RitualIfPresent,
} from './helpers/stageConformance';
import roukaJson from '../src/modules/m1/topics/rouka/s2.json';
import kashiteJson from '../src/modules/m1/topics/kashite/s2.json';
import bankJankenJson from '../src/modules/m1/topics/bank-janken/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;

/**
 * Final Module 1 Audio Integration Pass: the three things the pass itself was asked to verify,
 * as focused, directly-traceable tests rather than incidental side effects of other suites'
 * coverage.
 *
 * 1. Every one of Module 1's 20 real content units (8 Stories + 12 Bank Digs) has a registered,
 *    production-ready (`audioStatus: 'ready'`, real `lines`) script reachable via
 *    `audioScriptFor` — the exact lookup src/shell/MissionShell.tsx's screen routing uses. Before
 *    this pass, only 3 of the 20 were registered (src/audio/registry.ts); the other 17's own
 *    `audioStatus: 'ready'` manifests existed on disk but were never wired in, so their audio was
 *    entirely unreachable — not even the pending-production text-anchor fallback, since that
 *    requires a registered script too (see src/stage/AudioScene.tsx).
 * 2. A representative mission from each of the three placement buckets (`audioPlacement`,
 *    src/audio/types.ts) actually renders its real, per-line playback screen (`FullAudioScene`,
 *    not the text-anchor fallback) at exactly the moment its own role says it should — proving
 *    the registry fix alone wasn't enough, and the placement/wiring fix (src/shell/
 *    MissionShell.tsx's `finishStageWork`/`stageCompleted`/`chooseCoop`) is what actually gets a
 *    ready manifest to play instead of silently falling back to the plain practice/complete
 *    screens with no audio at all.
 * 3. Story 1-1's own demonstratedLayers=[0] guard (rev.3 §E) still holds — already covered
 *    directly by tests/Audio.test.tsx's own "WO-33 — 1-1 demonstrated-layer growth suppression"
 *    describe block, unaffected by anything this pass changed (chanto/1-1's own MODEL placement
 *    and registration are untouched); re-run here isn't duplicated, just confirmed by that
 *    existing suite passing alongside this one.
 */
describe('Final Module 1 Audio Integration Pass — 1. registry completeness (all 20 units reachable)', () => {
  const STORY_IDS: Array<[string, 'MODEL' | 'GUIDED' | 'CHECKPOINT' | 'independent practice']> = [
    ['m1-s2-1-1', 'MODEL'],
    ['m1-s2-1-2', 'GUIDED'],
    ['m1-s2-1-3', 'GUIDED'],
    ['m1-s2-1-4', 'CHECKPOINT'],
    ['m1-s2-1-5', 'GUIDED'],
    ['m1-s2-1-6', 'independent practice'],
    ['m1-s2-1-7', 'CHECKPOINT'],
    ['m1-s2-1-8', 'CHECKPOINT'],
  ];
  const BANK_IDS = [
    'bank-b01', 'bank-b02', 'bank-b03', 'bank-b04', 'bank-b05', 'bank-b06',
    'bank-b07', 'bank-b08', 'bank-b09', 'bank-b10', 'bank-b11', 'bank-b12',
  ];

  it.each(STORY_IDS)('%s has a registered, production-ready script with its own authored role (%s)', (id, role) => {
    const script = audioScriptFor(id);
    expect(script).toBeDefined();
    expect(script!.missionId).toBe(id);
    expect(script!.role).toBe(role);
    expect(script!.audioStatus).toBe('ready');
    expect(script!.lines).toBeDefined();
    expect(script!.lines!.length).toBeGreaterThan(0);
  });

  it.each(BANK_IDS)('%s (Bank Dig) has a registered, production-ready TRANSFER script', (id) => {
    const script = audioScriptFor(id);
    expect(script).toBeDefined();
    expect(script!.missionId).toBe(id);
    expect(script!.role).toBe('TRANSFER');
    expect(script!.audioStatus).toBe('ready');
    expect(script!.lines).toBeDefined();
    expect(script!.lines!.length).toBeGreaterThan(0);
  });

  it('every line of every one of the 20 registered scripts points at a real committed audioUrl, never a placeholder', () => {
    for (const [id] of STORY_IDS) {
      for (const line of audioScriptFor(id)!.lines!) {
        expect(line.audioUrl).toMatch(/^\/audio\/m1\//);
      }
    }
    for (const id of BANK_IDS) {
      for (const line of audioScriptFor(id)!.lines!) {
        expect(line.audioUrl).toMatch(/^\/audio\/m1\//);
      }
    }
  });

  it('placement categorization matches the Architect\'s own documented shape for every one of the 20 units', () => {
    expect(audioPlacement(audioScriptFor('m1-s2-1-1')!.role)).toBe('pre'); // MODEL
    expect(audioPlacement(audioScriptFor('m1-s2-1-2')!.role)).toBe('pre'); // GUIDED
    expect(audioPlacement(audioScriptFor('m1-s2-1-3')!.role)).toBe('pre'); // GUIDED
    expect(audioPlacement(audioScriptFor('m1-s2-1-4')!.role)).toBe('post-gated'); // CHECKPOINT
    expect(audioPlacement(audioScriptFor('m1-s2-1-5')!.role)).toBe('pre'); // GUIDED (FRAME)
    expect(audioPlacement(audioScriptFor('m1-s2-1-6')!.role)).toBe('post-ungated'); // "not a checkpoint"
    expect(audioPlacement(audioScriptFor('m1-s2-1-7')!.role)).toBe('post-gated'); // CHECKPOINT
    expect(audioPlacement(audioScriptFor('m1-s2-1-8')!.role)).toBe('post-gated'); // CHECKPOINT
    for (const id of BANK_IDS) {
      expect(audioPlacement(audioScriptFor(id)!.role)).toBe('post-ungated'); // TRANSFER
    }
  });
});

function renderSingleMission(mission: Mission) {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={[]} mission={mission} ui={ui} familyTestMode
      followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      continuousStageMissionIds={new Set([mission.id])}
    />,
  );
}

async function createProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
  await skipM0RitualIfPresent(user, ui);
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('Final Module 1 Audio Integration Pass — 2. ready manifests actually play (one representative per placement bucket)', () => {
  it('"pre" — 1-3 (rouka/GUIDED) shows its own real playback screen before practice, never a text-anchor fallback', async () => {
    const rouka = roukaJson as unknown as Mission;
    const user = userEvent.setup();
    renderSingleMission(rouka);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));

    expect(document.querySelector('[data-audio-role="GUIDED"]')).toBeInTheDocument();
    // Real committed MP3s exist (audioStatus 'ready') — FullAudioScene, not the text-anchor
    // fallback: a play button, not the two-tap .speech-bubble sequence.
    expect(screen.getByText(ui.audioPlayLabel!)).toBeInTheDocument();
    expect(document.querySelector('.speech-bubble')).not.toBeInTheDocument();
    expect(screen.queryByText(ui.stageQuestionPrompt)).not.toBeInTheDocument(); // practice hasn't started

    await user.click(screen.getByText(ui.handoffContinue)); // the always-available continue action
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument(); // now the real stage
  });

  it('"post-gated" — 1-7 (kashite/CHECKPOINT) never shows before or during practice, only after teach-back and M2b, co-play only', async () => {
    const kashite = kashiteJson as unknown as Mission;
    const user = userEvent.setup();
    renderSingleMission(kashite);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopYes));

    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    await playMissionScreenToCompletion(user, kashite, ui);
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument(); // still not shown

    await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageHandoffGiven));
    await waitFor(() => expect(screen.getByText(kashite.teachBack)).toBeInTheDocument());
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument(); // teach-back showing, M2b not yet
    await user.click(screen.getByText(ui.stageParentGotItLabel));
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument(); // M2b done, not tapped return yet

    await user.click(screen.getByText(ui.stageReturnToChild));
    expect(document.querySelector('[data-audio-role="CHECKPOINT"]')).toBeInTheDocument();
    expect(screen.getByText(ui.audioPlayLabel!)).toBeInTheDocument(); // real playback, not text-anchor

    await skipCheckpointAudioIfPresent(user);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });

  it('"post-gated" — 1-7 (kashite/CHECKPOINT) in SOLO: no teach-back/M2b, but a single 「あとでやる」 tap still reaches and completes its comparison audio (Builder work order §4)', async () => {
    const kashite = kashiteJson as unknown as Mission;
    const user = userEvent.setup();
    renderSingleMission(kashite);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, kashite, ui);

    // No teach-back/M2b in solo — straight to the single deferral tap instead of 'complete'.
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    // The completion animation's own real setTimeout delays this offer screen's own appearance.
    await waitFor(() => expect(screen.getByText(ui.teachbackSkip)).toBeInTheDocument());
    await user.click(screen.getByText(ui.teachbackSkip));
    expect(document.querySelector('[data-audio-role="CHECKPOINT"]')).toBeInTheDocument();
    expect(screen.getByText(ui.audioPlayLabel!)).toBeInTheDocument(); // real playback, not text-anchor

    await skipCheckpointAudioIfPresent(user);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });

  it('"post-ungated" — B03 (janken/TRANSFER) plays immediately after the child\'s own dig work in SOLO — never gated behind a parent hand-off', async () => {
    const janken = bankJankenJson as unknown as Mission;
    const user = userEvent.setup();
    renderSingleMission(janken);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));

    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument(); // not before practice
    await playMissionScreenToCompletion(user, janken, ui);

    // Right here — solo, no teach-back/M2b ever happened, yet the audio still shows.
    await waitFor(() => expect(document.querySelector('[data-audio-role="TRANSFER"]')).toBeInTheDocument());
    expect(screen.getByText(ui.audioPlayLabel!)).toBeInTheDocument(); // real playback, not text-anchor
    expect(screen.queryByText(ui.completeHeading)).not.toBeInTheDocument(); // before course-complete
    expect(screen.queryByText(ui.stageHandoffPrompt)).not.toBeInTheDocument(); // never a parent gate

    await user.click(screen.getByText(ui.handoffContinue));
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });

  it('"post-ungated" — B03 (janken/TRANSFER) plays right after the dig work in CO-PLAY too, before the handoff curtain — not the CHECKPOINT parent-gated path', async () => {
    const janken = bankJankenJson as unknown as Mission;
    const user = userEvent.setup();
    renderSingleMission(janken);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopYes));
    await playMissionScreenToCompletion(user, janken, ui);

    await waitFor(() => expect(document.querySelector('[data-audio-role="TRANSFER"]')).toBeInTheDocument());
    expect(screen.queryByText(ui.stageHandoffPrompt)).not.toBeInTheDocument(); // audio comes first

    await user.click(screen.getByText(ui.handoffContinue));
    await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageHandoffGiven));
    await waitFor(() => expect(screen.getByText(janken.teachBack)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageParentGotItLabel));
    await user.click(screen.getByText(ui.stageReturnToChild));
    // TRANSFER already played once, right after the dig work — never replayed here, and never
    // routed through the CHECKPOINT-only audio slot.
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });
});
