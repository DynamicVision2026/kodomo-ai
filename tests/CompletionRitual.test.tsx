import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import {
  playMissionScreenToCompletion, skipCompletionRitualIfPresent, skipCheckpointAudioIfPresent,
} from './helpers/stageConformance';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json';
import randoseruJson from '../src/modules/m1/topics/randoseru/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;
const chanto = chantoJson as unknown as Mission;
const randoseru = randoseruJson as unknown as Mission; // Story 1-8 — the completion-ritual mission

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

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
  await user.click(screen.getByText(ui.m0Action)); // seal M0 — behaviour #1's own dedicated tests below don't use this helper
}

/**
 * Architect-resolved completion ritual: the eight approved behaviours, canonically decided after
 * the earlier "eight approved ritual behaviours" report came back blocked (no definition was
 * accessible in this session). Verifies exactly what was specified — no additional mechanics,
 * scoring, content capture, rewards, or instructional content beyond it.
 */
describe('Architect completion ritual — behaviour #1: M0 at first entry, before any teaching', () => {
  it('a brand-new profile sees the M0 ritual immediately after profile creation, before Course Home and before Story 1-1\'s own MODEL audio', async () => {
    const user = userEvent.setup();
    renderSingleMission(chanto);
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));

    // M0 first — not Course Home, not the audio screen, not the coop question.
    expect(document.querySelector('.mission-shell__m0-ritual')).toBeInTheDocument();
    expect(screen.queryByText(ui.courseHomeContinueLabel)).not.toBeInTheDocument();
    expect(document.querySelector('[data-audio-role]')).not.toBeInTheDocument();
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();

    // Seal it — only then does the rest of the app (audio included) become reachable.
    await user.click(screen.getByText(ui.m0Action));
    expect(document.querySelector('.mission-shell__m0-ritual')).not.toBeInTheDocument();
    expect(screen.getByText(ui.courseHomeContinueLabel)).toBeInTheDocument();
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    expect(document.querySelector('[data-audio-role="MODEL"]')).toBeInTheDocument();
  });

  it('nothing about the child\'s written question is captured — no text input anywhere on the M0 screen', async () => {
    const user = userEvent.setup();
    renderSingleMission(chanto);
    await createProfile(user);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(document.querySelectorAll('[contenteditable]')).toHaveLength(0);
    expect(document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])')).toHaveLength(0);
  });

  it('a returning profile that already sealed M0 goes straight to Course Home — the ritual never repeats', async () => {
    const user = userEvent.setup();
    renderSingleMission(chanto);
    await createProfile(user); // seals M0
    cleanup();

    renderSingleMission(chanto);
    await user.click(screen.getByText('たぬき'));
    expect(document.querySelector('.mission-shell__m0-ritual')).not.toBeInTheDocument();
    expect(screen.getByText(ui.courseHomeContinueLabel)).toBeInTheDocument();
  });
});

describe('Architect completion ritual — behaviours #2/#3: after Story 1-8, optional Real AI Lab (co-play) then the required ritual; skipping reaches it directly', () => {
  async function playSoloToCompletionRitual(user: ReturnType<typeof userEvent.setup>) {
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, randoseru, ui);
  }

  it('solo play (no Real AI Lab reachable at all) reaches the required ritual directly after Story 1-8\'s own dig work', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await playSoloToCompletionRitual(user);
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).not.toBeInTheDocument();
    expect(screen.queryByText(ui.completeHeading)).not.toBeInTheDocument();
  });

  it('co-play, tapping Real AI Lab\'s "つづける" (tried it), still reaches the exact same required ritual next', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopYes));
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageHandoffGiven));
    await waitFor(() => expect(screen.getByText(randoseru.teachBack)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageParentGotItLabel));
    await user.click(screen.getByText(ui.stageReturnToChild));
    // randoseru (1-8) now has its own registered CHECKPOINT audio too (Final Module 1 Audio
    // Integration Pass) — same "post-gated" placement as oyatsu's, it plays first.
    await skipCheckpointAudioIfPresent(user);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());
    await user.click(screen.getByText(ui.handoffContinue));
    expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument();
  });

  it('co-play, tapping Real AI Lab\'s "あとでやる" (skip), reaches the required ritual just as directly — skipping is not a shortcut around it', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopYes));
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageHandoffGiven));
    await waitFor(() => expect(screen.getByText(randoseru.teachBack)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageParentGotItLabel));
    await user.click(screen.getByText(ui.stageReturnToChild));
    // randoseru (1-8) now has its own registered CHECKPOINT audio too (Final Module 1 Audio
    // Integration Pass) — same "post-gated" placement as oyatsu's, it plays first.
    await skipCheckpointAudioIfPresent(user);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());
    await user.click(screen.getByText(ui.handoffSkip));
    expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument();
  });
});

describe('Architect completion ritual — behaviour #4: the exact same baseline topic returns at completion', () => {
  it('the completion ritual\'s own "write" step shows the identical m0ChildPrompt text as M0', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    expect(screen.getByText(ui.m0ChildPrompt!)).toBeInTheDocument();
  });
});

describe('Architect completion ritual — behaviours #5/#6: write again, nothing captured, THEN prompt to open the envelope and compare — no scoring/judgement', () => {
  async function toCompletionRitual(user: ReturnType<typeof userEvent.setup>) {
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
  }

  it('the compare/open-envelope prompt is not shown until the "written" step has been advanced past', async () => {
    const user = userEvent.setup();
    await toCompletionRitual(user);
    expect(screen.queryByText(ui.m0ParentForward!)).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue));
    expect(screen.getByText(ui.m0ParentForward!)).toBeInTheDocument();
  });

  it('no text input anywhere across any step of the completion ritual — nothing is ever captured', async () => {
    const user = userEvent.setup();
    await toCompletionRitual(user);
    for (let step = 0; step < 3; step++) {
      expect(document.querySelectorAll('textarea')).toHaveLength(0);
      expect(document.querySelectorAll('[contenteditable]')).toHaveLength(0);
      expect(document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])')).toHaveLength(0);
      const nextButton = screen.queryByText(ui.handoffContinue);
      if (nextButton) await user.click(nextButton);
    }
  });
});

describe('Architect completion ritual — behaviour #7: 親子認定証 issued at completion, its one blank never filled in by this app', () => {
  it('the certificate step shows the exact canonical blank line, verbatim, and links to the existing Print Centre item — never rendering the certificate itself', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    await user.click(screen.getByText(ui.handoffContinue)); // write -> compare
    await user.click(screen.getByText(ui.handoffContinue)); // compare -> certificate

    expect(screen.getByText(ui.certificateHeading!)).toBeInTheDocument();
    expect(screen.getByText(ui.certificateBlankLabel!)).toBeInTheDocument();
    expect(ui.certificateBlankLabel).toContain('○○');
    expect(ui.certificateBlankLabel).toContain('＿＿');

    let openedUrl: string | undefined;
    const originalOpen = window.open;
    window.open = ((url?: string | URL) => { openedUrl = String(url); return null; }) as typeof window.open;
    try {
      await user.click(screen.getByText(ui.courseHomeKitLabel));
      expect(openedUrl).toBe('/print/centre/');
    } finally {
      window.open = originalOpen;
    }
  });

  it('completing the ritual reaches the ordinary course-complete screen next — the ritual is not itself the final screen', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    await skipCompletionRitualIfPresent(user, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });
});

describe('Architect completion ritual — behaviour #8: Real AI Lab never populates the certificate line and never counts as M5', () => {
  it('tapping Real AI Lab\'s "tried it" leaves M5 untouched all the way through the ritual and into completion', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopYes));
    await playMissionScreenToCompletion(user, randoseru, ui);
    await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageHandoffGiven));
    await waitFor(() => expect(screen.getByText(randoseru.teachBack)).toBeInTheDocument());
    await user.click(screen.getByText(ui.stageParentGotItLabel));
    await user.click(screen.getByText(ui.stageReturnToChild));
    // randoseru (1-8) now has its own registered CHECKPOINT audio too (Final Module 1 Audio
    // Integration Pass) — same "post-gated" placement as oyatsu's, it plays first.
    await skipCheckpointAudioIfPresent(user);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());
    await user.click(screen.getByText(ui.handoffContinue));

    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    await skipCompletionRitualIfPresent(user, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());

    const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved.profiles[0].milestones?.M5).toBeUndefined();
  });
});
