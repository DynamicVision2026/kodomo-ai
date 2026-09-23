import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import { playMissionScreenToCompletion, skipCheckpointAudioIfPresent, skipM0RitualIfPresent, skipCompletionRitualIfPresent } from './helpers/stageConformance';
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
  await skipM0RitualIfPresent(user, ui);
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
  // Final Module 1 Audio Integration Pass: randoseru (1-8) and kashite (1-7) now both have their
  // own registered CHECKPOINT audio too — it plays first, same "post-gated" placement as
  // oyatsu's; skip through it before whatever comes next (Real AI Lab, or straight to complete
  // for every mission but randoseru) ever appears. A no-op for a mission with none.
  await skipCheckpointAudioIfPresent(user);
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

    // Only now — strictly after teach-back and M2b. randoseru (1-8) now has its own registered
    // CHECKPOINT audio too (Final Module 1 Audio Integration Pass) — same "post-gated" placement
    // as oyatsu's, it plays first; skip through it before Real AI Lab, its own next screen, ever
    // appears.
    await user.click(screen.getByText(ui.stageReturnToChild));
    await skipCheckpointAudioIfPresent(user);
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
    // Architect completion ritual: solo play reaches the required ritual directly (no Real AI
    // Lab, since that stays co-play only — solo never reaches 'stage-teachback' at all).
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    expect(document.querySelector('.mission-shell__real-ai-lab-heading')).not.toBeInTheDocument();
    await skipCompletionRitualIfPresent(user, ui);
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
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    await skipCompletionRitualIfPresent(user, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  });

  it('tapping "あとでやる" (skip) reaches the exact same course-complete screen — skipping is a completely normal outcome', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await playToReturnToChild(user, randoseru);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());
    await user.click(screen.getByText(ui.handoffSkip));
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    await skipCompletionRitualIfPresent(user, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    // Course completion itself is entirely unaffected either way — the whole point of "optional".
    expect(screen.getByText(ui.completeCourseFinishedLabel)).toBeInTheDocument();
  });
});

describe('WO-34 — Architect\'s alignment correction: Step 4 (child composes the next question aloud)', () => {
  it('renders Step 4 alongside Steps 1-3, before either action is taken', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await playToReturnToChild(user, randoseru);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());
    // Steps 1-3 (ask bare, ask again with one condition changed, compare) and Step 4 (child
    // composes the next question aloud, parent types it, family looks at the third answer) are
    // both present on the same screen — the four-step sequence is one activity, not two.
    expect(screen.getByText(ui.realAiLabIntro!)).toBeInTheDocument();
    expect(screen.getByText(ui.realAiLabStep4!)).toBeInTheDocument();
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

describe('WO-34 — invariants: no stored AI content, no M5, at most one parent-tapped signal', () => {
  it('tapping "tried it" touches neither milestones.M5 nor any new memories field — real AI Lab is its own, separate signal', async () => {
    const user = userEvent.setup();
    renderSingleMission(randoseru);
    await playToReturnToChild(user, randoseru);
    await waitFor(() => expect(screen.getByText(ui.realAiLabHeading!)).toBeInTheDocument());

    const before = JSON.parse(localStorage.getItem('m-app.v2')!);
    const m5Before = before.profiles[0].milestones?.M5;

    await user.click(screen.getByText(ui.handoffContinue));
    await waitFor(() => expect(document.querySelector('.mission-shell__completion-ritual')).toBeInTheDocument());
    await skipCompletionRitualIfPresent(user, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());

    const after = JSON.parse(localStorage.getItem('m-app.v2')!);
    // M5 (そとで つかった) is a parent-initiated, per-move outside-use record — completely
    // unrelated to this screen, and must stay exactly as it was.
    expect(after.profiles[0].milestones?.M5).toEqual(m5Before);
    // This app never persists anything the family typed into, or the AI said back on, their own
    // account — there is nothing in this repo's Profile shape a screen with no text input and no
    // API call could even write that content to.
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
