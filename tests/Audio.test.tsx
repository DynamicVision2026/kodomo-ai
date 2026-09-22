import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import {
  playMissionStageToCompletion, playMissionScreenToCompletion,
  skipPrePracticeAudioIfPresent, skipCheckpointAudioIfPresent, skipM0RitualIfPresent,
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

  it('1-4 (oyatsu/CHECKPOINT): never appears in solo play at all (solo never reaches teach-back/M2b)', async () => {
    const user = userEvent.setup();
    renderSingleMission(oyatsu);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();

    await playMissionScreenToCompletion(user, oyatsu, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
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
});
