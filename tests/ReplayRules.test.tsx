import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { MissionLibrary } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import {
  playMissionScreenToCompletion, skipCheckpointAudioIfPresent, skipCompletionRitualIfPresent,
  skipM0RitualIfPresent, skipPostWorkAudioIfPresent,
} from './helpers/stageConformance';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanJson from '../src/modules/m1/topics/genkan/s2.json';
import roukaJson from '../src/modules/m1/topics/rouka/s2.json';
import oyatsuJson from '../src/modules/m1/topics/oyatsu/s2.json';
import minnaJson from '../src/modules/m1/topics/minna/s2.json';
import zuruiJson from '../src/modules/m1/topics/zurui/s2.json';
import kashiteJson from '../src/modules/m1/topics/kashite/s2.json';
import randoseruJson from '../src/modules/m1/topics/randoseru/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;
const chanto = chantoJson as unknown as Mission; // role MODEL — pre-dig only, no post audio.
const genkan = genkanJson as unknown as Mission;
const oyatsu = oyatsuJson as unknown as Mission; // role CHECKPOINT — post-gated audio.

const STORY = [chanto, genkan, roukaJson, oyatsu, minnaJson, zuruiJson, kashiteJson, randoseruJson]
  .map((m) => m as unknown as Mission);

const missionLibrary: MissionLibrary = {
  missionOrder: STORY.map((m) => m.id),
  missions: Object.fromEntries(STORY.map((m) => [m.id, m])),
};
const continuousStageMissionIds = new Set<string>(STORY.map((m) => m.id));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

function renderShell() {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={[]} mission={chanto}
      missionLibrary={missionLibrary} ui={ui} familyTestMode
      followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      continuousStageMissionIds={continuousStageMissionIds}
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

function seedDone(missionIds: string[]) {
  const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
  const profile = saved.profiles[0];
  profile.progress = profile.progress ?? {};
  for (const id of missionIds) profile.progress[id] = { done: true, stamps: 0, coop: false };
  localStorage.setItem('m-app.v2', JSON.stringify(saved));
}

/**
 * Builder work order §7 (Replay rules): "From Course Home: a completed lesson's plane offers a
 * small replay icon that opens its pocket (pre or post audio). Lessons that are not completed
 * offer nothing... Post-dig audio... shown at mission complete as today, replayable there...
 * Replaying never changes evidence." Verified against real, registered Module 1 content
 * (chanto/MODEL = pre-dig-only, oyatsu/CHECKPOINT = post-gated) rather than synthetic fixtures,
 * reusing the same helpers (tests/helpers/stageConformance.ts) the Golden Conformance suite does.
 */
describe('Builder work order §7 — replay rules', () => {
  it('Course Home offers a replay icon only for a COMPLETED lesson with registered audio; an undone lesson offers nothing', async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfile(user);
    seedDone([chanto.id]); // genkan stays undone
    cleanup();
    const freshUser = userEvent.setup();
    renderShell();
    await freshUser.click(screen.getByText('たぬき'));

    const chantoRow = screen.getByText(chanto.title).closest('.course-home__depth') as HTMLElement;
    expect(within(chantoRow).getByLabelText(ui.audioReplayLabel!)).toBeInTheDocument();

    const genkanRow = screen.getByText(genkan.title).closest('.course-home__depth') as HTMLElement;
    expect(within(genkanRow).queryByLabelText(ui.audioReplayLabel!)).not.toBeInTheDocument();
  });

  it("tapping the Course Home replay icon opens that mission's own audio and returns to Course Home on skip, writing no evidence", async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfile(user);
    seedDone([oyatsu.id]);
    cleanup();
    const freshUser = userEvent.setup();
    renderShell();
    await freshUser.click(screen.getByText('たぬき'));

    const before = localStorage.getItem('m-app.v2');

    const oyatsuRow = screen.getByText(oyatsu.title).closest('.course-home__depth') as HTMLElement;
    await freshUser.click(within(oyatsuRow).getByLabelText(ui.audioReplayLabel!));

    await waitFor(() => expect(document.querySelector('[data-audio-role]')).toBeInTheDocument());
    expect(screen.queryByText(ui.courseHomeHeading)).not.toBeInTheDocument();

    await freshUser.click(document.querySelector('.ad12-listening-pocket__skip') as HTMLElement);

    await waitFor(() => expect(screen.getByText(ui.courseHomeHeading)).toBeInTheDocument());
    expect(localStorage.getItem('m-app.v2')).toBe(before);
  });

  it('MissionComplete offers no replay action for a mission with pre-dig-only (GUIDED) audio', async () => {
    // genkan (Story 2, role GUIDED — pre-dig only): same proven playMissionScreenToCompletion
    // path GoldenConformance already exercises for this exact mission (its own sampled SOLO run).
    const user = userEvent.setup();
    renderShell();
    await createProfile(user);
    seedDone(STORY.map((m) => m.id)); // every prerequisite satisfied, same as GoldenConformance's SAMPLE
    cleanup();
    const freshUser = userEvent.setup();
    renderShell();
    await freshUser.click(screen.getByText('たぬき'));
    await freshUser.click(screen.getByText(genkan.title));
    await freshUser.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(freshUser, genkan, ui);
    await skipPostWorkAudioIfPresent(freshUser);
    await skipCheckpointAudioIfPresent(freshUser, ui);
    await skipCompletionRitualIfPresent(freshUser, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());

    expect(screen.queryByLabelText(ui.audioReplayLabel!)).not.toBeInTheDocument();
  });

  it('MissionComplete offers a replay action for a mission with post-dig (CHECKPOINT) audio, and replaying it writes no further evidence', async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfile(user);
    seedDone(STORY.map((m) => m.id)); // every prerequisite satisfied, same as GoldenConformance's SAMPLE
    cleanup();
    const freshUser = userEvent.setup();
    renderShell();
    await freshUser.click(screen.getByText('たぬき'));
    await freshUser.click(screen.getByText(oyatsu.title));
    await freshUser.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(freshUser, oyatsu, ui);
    await skipPostWorkAudioIfPresent(freshUser);

    // The REAL first CHECKPOINT play (§4's solo offer, then actually pressing play, not just
    // skipping) — this is the one allowed to write checkpointAudioHeard.
    const soloOffer = screen.queryByText(ui.teachbackSkip);
    if (soloOffer) await freshUser.click(soloOffer);
    await waitFor(() => expect(document.querySelector('[data-audio-role="CHECKPOINT"]')).toBeInTheDocument());
    await freshUser.click(document.querySelector('[data-audio-role="CHECKPOINT"] .ad12-voice-plane--interactive') as HTMLElement);
    await freshUser.click(document.querySelector('[data-audio-role="CHECKPOINT"] .ad12-listening-pocket__skip') as HTMLElement);

    await skipCompletionRitualIfPresent(freshUser, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());

    const before = localStorage.getItem('m-app.v2');
    expect(JSON.parse(before!).profiles[0].checkpointAudioHeard).toContain(oyatsu.id);

    const replayButton = screen.getByLabelText(ui.audioReplayLabel!);
    expect(replayButton).toBeInTheDocument();

    await freshUser.click(replayButton);
    await waitFor(() => expect(document.querySelector('[data-audio-role="CHECKPOINT"]')).toBeInTheDocument());
    // Play it again this time too — even a genuinely-played replay must write nothing further.
    await freshUser.click(document.querySelector('[data-audio-role="CHECKPOINT"] .ad12-voice-plane--interactive') as HTMLElement);
    await freshUser.click(document.querySelector('[data-audio-role="CHECKPOINT"] .ad12-listening-pocket__skip') as HTMLElement);

    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    expect(localStorage.getItem('m-app.v2')).toBe(before);
  });
});
