import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import { playMissionScreenToCompletion, skipCheckpointAudioIfPresent } from './helpers/stageConformance';
import randoseruJson from '../src/modules/m1/topics/randoseru/s2.json';
import kashiteJson from '../src/modules/m1/topics/kashite/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;
const randoseru = randoseruJson as unknown as Mission; // Story 1-8 — the Real AI Lab mission
const kashite = kashiteJson as unknown as Mission; // Story 1-7 — NOT the Real AI Lab mission

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

async function createProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
}

function renderSingleMission(mission: Mission) {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={[]} mission={mission} ui={ui} familyTestMode
      followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      continuousStageMissionIds={new Set([mission.id])}
    />,
  );
}

/** Drives a mission through the real MissionShell co-play sequence up to and including the
 *  'stage-teachback' screen's own return-to-child tap — the one place either CHECKPOINT audio
 *  or the Real AI Lab can ever be reached from. */
async function playToReturnToChild(user: ReturnType<typeof userEvent.setup>, mission: Mission) {
  await createProfile(user);
  await user.click(screen.getByText(ui.courseHomeContinueLabel));
  await user.click(screen.getByText(ui.coopYes));
  await playMissionScreenToCompletion(user, mission, ui);
  await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
  await user.click(screen.getByText(ui.stageHandoffGiven));
  await waitFor(() => expect(screen.getByText(mission.teachBack)).toBeInTheDocument());
  await user.click(screen.getByText(ui.stageParentGotItLabel));
  await user.click(screen.getByText(ui.stageReturnToChild));
}

describe('WO-34 — Real AI Lab: placement (after Story 1-8, before course-complete, co-play only)', () => {
  it('appears only after teach-back and M2b are both already done — never before', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopYes));

    // Root reached, きょうのコツ read, handoff shown — still not before teach-back.
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.stageHandoffGiven));

    // Teach-back showing, M2b not yet confirmed — still not shown.
    await waitFor(() => expect(screen.getByText(randoseru.teachBack)).toBeInTheDocument());
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.stageParentGotItLabel));

    // M2b just confirmed, "return to child" not yet tapped — still not shown.
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).not.toBeInTheDocument();
    expect(screen.getByText(ui.stageReturnToChild)).toBeInTheDocument();

    // Only now — strictly after teach-back and M2b.
    await user.click(screen.getByText(ui.stageReturnToChild));
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).toBeInTheDocument();
    expect(screen.queryByText(ui.completeHeading)).not.toBeInTheDocument(); // before the course-complete screen
  });

  it('only ever appears for Story 1-8 (randoseru) — every other mission goes straight to complete', async () => {
    const user = userEvent.setup();
    renderSingleMission(kashite);
    await playToReturnToChild(user, kashite);
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });

  it('never appears in solo play — solo never reaches teach-back/M2b at all', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).not.toBeInTheDocument();
  });
});

describe('WO-34 — Real AI Lab: optional, never blocks course completion', () => {
  it('tapping "つづける" (tried it) reaches the course-complete screen', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await playToReturnToChild(user, randoseru);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());
    await user.click(screen.getByText(ui.handoffContinue));
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });

  it('tapping "あとでやる" (skip) reaches the exact same course-complete screen — skipping is a completely normal outcome', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await playToReturnToChild(user, randoseru);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());
    await user.click(screen.getByText(ui.handoffSkip));
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    // Course completion itself is entirely unaffected either way — the whole point of "optional".
    expect(screen.getByText(ui.completeCourseFinishedLabel)).toBeInTheDocument();
  });
});

describe('WO-34 — Real AI Lab: reuses the existing approved guide, introduces no free text, no runtime AI call', () => {
  it('the guide-link button opens Print Centre (the existing Real AI guide\'s own home) via window.open, never new content', async () => {
    const user = userEvent.setup();
    let openedUrl: string | undefined;
    const originalOpen = window.open;
    window.open = ((url?: string | URL) => { openedUrl = String(url); return null; }) as typeof window.open;
    try {
      renderSingleMission(randoseru);
      await playToReturnToChild(user, randoseru);
      await waitFor(() => expect(screen.getByText(ui.realAiLabGuideLinkLabel!)).toBeInTheDocument());
      await user.click(screen.getByText(ui.realAiLabGuideLinkLabel!));
      expect(openedUrl).toBe('/print/centre/');
    } finally {
      window.open = originalOpen;
    }
  });

  it('renders no textarea, contenteditable or free-text input anywhere on the screen', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await playToReturnToChild(user, randoseru);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(document.querySelectorAll('[contenteditable]')).toHaveLength(0);
    expect(document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])')).toHaveLength(0);
  });
});

describe('WO-34 — CHECKPOINT audio and Real AI Lab stay independent (different missions, no collision)', () => {
  it('oyatsu (1-4, CHECKPOINT audio mission) never shows the Real AI Lab', async () => {
    const oyatsuJson = (await import('../src/modules/m1/topics/oyatsu/s2.json')).default;
    const oyatsu = oyatsuJson as unknown as Mission;
    const user = userEvent.setup();
    renderSingleMission(oyatsu);
    await playToReturnToChild(user, oyatsu);
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).not.toBeInTheDocument();
    await skipCheckpointAudioIfPresent(user);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });
});
