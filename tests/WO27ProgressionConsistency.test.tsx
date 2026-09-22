import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { MissionLibrary, BankLibrary } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import { playMissionScreenToCompletion, skipPrePracticeAudioIfPresent, skipM0RitualIfPresent } from './helpers/stageConformance';
import { titleMatcher } from './helpers/titleText';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanJson from '../src/modules/m1/topics/genkan/s2.json';
import roukaJson from '../src/modules/m1/topics/rouka/s2.json';
import oyatsuJson from '../src/modules/m1/topics/oyatsu/s2.json';
import minnaJson from '../src/modules/m1/topics/minna/s2.json';
import zuruiJson from '../src/modules/m1/topics/zurui/s2.json';
import kashiteJson from '../src/modules/m1/topics/kashite/s2.json';
import randoseruJson from '../src/modules/m1/topics/randoseru/s2.json';
import bankAtodeJson from '../src/modules/m1/topics/bank-atode/s2.json';
import bankEscalatorJson from '../src/modules/m1/topics/bank-escalator/s2.json';
import bankJankenJson from '../src/modules/m1/topics/bank-janken/s2.json';
import bankTeamJson from '../src/modules/m1/topics/bank-team/s2.json';
import bankGakunenJson from '../src/modules/m1/topics/bank-gakunen/s2.json';
import bankNedanJson from '../src/modules/m1/topics/bank-nedan/s2.json';
import bankKireiJson from '../src/modules/m1/topics/bank-kirei/s2.json';
import bankHoshiiJson from '../src/modules/m1/topics/bank-hoshii/s2.json';
import bankKotobaJson from '../src/modules/m1/topics/bank-kotoba/s2.json';
import bankItadakimasuJson from '../src/modules/m1/topics/bank-itadakimasu/s2.json';
import bankArigatouJson from '../src/modules/m1/topics/bank-arigatou/s2.json';
import bank100yenJson from '../src/modules/m1/topics/bank-100yen/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;

const STORY = [
  chantoJson, genkanJson, roukaJson, oyatsuJson, minnaJson, zuruiJson, kashiteJson, randoseruJson,
].map((m) => m as unknown as Mission);
const BANKS = [
  bankAtodeJson, bankEscalatorJson, bankJankenJson, bankTeamJson, bankGakunenJson, bankNedanJson,
  bankKireiJson, bankHoshiiJson, bankKotobaJson, bankItadakimasuJson, bankArigatouJson, bank100yenJson,
].map((m) => m as unknown as Mission);

const missionLibrary: MissionLibrary = {
  missionOrder: STORY.map((m) => m.id),
  missions: Object.fromEntries(STORY.map((m) => [m.id, m])),
};
const bankLibrary: BankLibrary = {
  bankOrder: BANKS.map((m) => m.id),
  missions: Object.fromEntries(BANKS.map((m) => [m.id, m])),
};
const continuousStageMissionIds = new Set<string>([...STORY.map((m) => m.id), ...BANKS.map((m) => m.id)]);

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

/**
 * Real production wiring: `freeMissionIds` covers only Story 1 (chanto) — exactly
 * `moduleJson.freeMissionIds` — and `familyTestMode` is never passed. Every render in this file
 * goes through the ACTUAL `hasAccess()` entitlement check, never a bypass, per WO-27 §10's own
 * explicit requirement (the existing WO-26 FullCourseJourney regression passed while production
 * failed precisely because it used familyTestMode throughout).
 */
function renderRealShell() {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoJson as unknown as Mission}
      missionLibrary={missionLibrary} bankLibrary={bankLibrary} ui={ui}
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

/** Grants a real `m1:full` purchase entitlement to the just-created profile's own AppState —
 *  the same shape `applyRedemption` (src/engine/entitlements.ts) writes after a real Shopify
 *  redemption, never a familyTestMode bypass. WO-30 §0: also sets `redeemedCode`, now the actual
 *  credential reconcileEntitlements() requires before it will trust the `:full` tag at all — a
 *  bare `entitlements: ['m1:full']` with no code is exactly the forged-localStorage case WO-30
 *  closes, so this helper must supply both to still mean "a real purchase happened here". */
function grantFullEntitlement() {
  const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
  saved.entitlements = ['m1:full'];
  saved.redeemedCode = 'NAZE-TEST-TEST';
  localStorage.setItem('m-app.v1', JSON.stringify(saved));
}

// ===============================================================================================
// WO-27 §9 Tests A, D, G + the real-navigation-path requirement (§10) — real production
// entitlement (Story 1 free only, no purchase). Story 2 is genuinely unentitled here, exactly
// like the live defect report, so — per the explicit product decision on this ticket — it must
// render and behave as LOCKED (purchase-needed), never as a falsely-enterable CURRENT.
// ===============================================================================================
describe('WO-27 — real production entitlement (no purchase): CURRENT => ENTERABLE holds, and a genuinely unentitled Story never lies about it', () => {
  it('TEST A — fresh profile: Story 1 is CURRENT and reachable via BOTH real navigation routes; Story 2 is sequentially LOCKED', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);

    expect(document.querySelector('.course-home__depth.is-current')).toBeTruthy();
    expect(screen.getByText(chantoJson.title).closest('.course-home__depth')!.className).toContain('is-current');
    expect(screen.getByText(genkanJson.title).closest('.course-home__depth')!.className).toContain('is-locked');

    // Real-navigation route: Course Home -> tap the CURRENT Story -> MissionShell -> playable.
    await user.click(screen.getByText(chantoJson.title));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });

  it('real-navigation route: Course Home -> 「つづきを ほる」 -> MissionShell -> playable mission', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);

    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
    await user.click(screen.getByText(ui.coopSolo));
    // WO-33: chanto's own MODEL audio plays first now — tap through it before the slot tray.
    await skipPrePracticeAudioIfPresent(user);
    // Genuinely playable, not just a screen transition — the slot tray for chanto renders.
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument();
  });

  it('TEST D — a genuinely future Story (3) stays LOCKED with the sequencing message, not the purchase one, even after Story 1 completes', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, chantoJson as unknown as Mission, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    await user.click(screen.getByText(ui.completeBackToMapLabel));

    const roukaDepth = screen.getByText(roukaJson.title).closest('.course-home__depth-button')!;
    await user.click(roukaDepth);
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
    expect(screen.getByText(ui.courseHomeSequentialLockedMessage)).toBeInTheDocument();
  });

  it('after Story 1 completes: Story 2 is sequentially next but genuinely unentitled — shown as LOCKED with the real entitlement message, never as a falsely-enterable CURRENT (documents the accepted resolution: the Story spine stays paywalled past Mission 1; WO-27\'s literal "Story 2 = CURRENT/ENTERABLE" is intentionally NOT met here by product decision)', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, chantoJson as unknown as Mission, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    await user.click(screen.getByText(ui.completeBackToMapLabel));

    const genkanDepth = screen.getByText(genkanJson.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).not.toContain('is-current');
    expect(genkanDepth.className).toContain('is-locked');
    expect(screen.queryByText(ui.courseHomeContinueLabel)).not.toBeInTheDocument();
    expect(screen.getByText(ui.lockedMessage)).toBeInTheDocument();

    // All three routes agree it's not enterable: completion CTA, depth tap, continue CTA.
    // (completion CTA / continue CTA are both absent/gone; the depth tap below is the third.)
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
  });

  it('TEST E — parent isolation: completing Story 1\'s own parent follow-up (M2b confirm — M0 now seals at profile creation, before this screen is ever reached) after a blocked Story 2 entry attempt never creates a false Story 2 completion context', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, chantoJson as unknown as Mission, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());

    // The exact live reproduction: tap 「つぎの ミッション」 -> blocked (Story 2 unentitled).
    await user.click(screen.getByText(ui.completeNextMissionLabel));
    expect(screen.getByText(ui.lockedMessage)).toBeInTheDocument();
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.completeBackToMapLabel));

    // Open the parent dashboard directly from Course Home (never through Story 2 at all).
    // M0 is already sealed — createProfile's own skipM0RitualIfPresent sealed it right after
    // profile creation, so this screen shows ui.m0SealedMessage, not the seal button.
    await user.click(screen.getByText(ui.parentScreenHeading));
    expect(screen.getByText(ui.m0SealedMessage)).toBeInTheDocument();
    await user.click(screen.getByText(ui.m2ConfirmAction)); // はい、そう 言えていました
    await user.click(screen.getByText(ui.stageReturnToChild)); // こどもに もどす

    // The parent dashboard was opened independently (never through a real mission handoff), so
    // there is no legitimate "just finished" mission at all — it returns straight to Course
    // Home, never fabricating ANY completion screen (Story 1's own included). This is the fix:
    // no inconsistent completion summary ever appears, for either mission.
    await waitFor(() => expect(screen.getByText(ui.courseHomeHeading)).toBeInTheDocument());
    expect(screen.queryByText(ui.completeHeading)).not.toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].progress[genkanJson.id]).toBeUndefined(); // never marked done
    const genkanDepth = screen.getByText(genkanJson.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).not.toContain('is-done');
    expect(genkanDepth.className).toContain('is-locked'); // still not entitled, still not CURRENT
  });

  it('TEST G — persistence: after Story 1 completes, a real reload through the profile picker preserves the same LOCKED/unentitled state for Story 2', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, chantoJson as unknown as Mission, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    await user.click(screen.getByText(ui.completeBackToMapLabel));

    cleanup();
    renderRealShell();
    await user.click(screen.getByText('たぬき'));

    expect(screen.getByText(chantoJson.title).closest('.course-home__depth')!.className).toContain('is-done');
    const genkanDepth = screen.getByText(genkanJson.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).not.toContain('is-current');
    expect(genkanDepth.className).toContain('is-locked');
    expect(screen.queryByText(ui.courseHomeContinueLabel)).not.toBeInTheDocument();
  });
});

// ===============================================================================================
// WO-27 §9 Tests B, C, F, H — a genuinely PURCHASED family (real `m1:full` entitlement, written
// the same way a real Shopify redemption would via `applyRedemption`), progressing through the
// real navigation path. Here CURRENT really is ENTERABLE for every Story in sequence, and all
// three entry routes genuinely agree.
// ===============================================================================================
describe('WO-27 — real production entitlement, PURCHASED family: full Story progression + Bank schedule, via real navigation', () => {
  it('TEST B/C — after Story 1 completes, Story 2 is CURRENT and ENTERABLE via all three routes: completion CTA, Course Home depth tap, Course Home continue CTA', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);
    grantFullEntitlement();
    cleanup();
    renderRealShell();
    await user.click(screen.getByText('たぬき'));

    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, chantoJson as unknown as Mission, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());

    // Route A: the completion screen's own next-mission CTA.
    await user.click(screen.getByText(ui.completeNextMissionLabel));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
    expect(screen.queryByText(ui.lockedMessage)).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.coopSolo));
    // WO-33: genkan's own GUIDED audio plays first now — tap through it before the slot tray.
    await skipPrePracticeAudioIfPresent(user);
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument(); // genkan's own slot tray

    // Route B: Course Home -> tap the Story 2 depth directly (fresh render, same profile).
    cleanup();
    renderRealShell();
    await user.click(screen.getByText('たぬき'));
    expect(screen.getByText(genkanJson.title).closest('.course-home__depth')!.className).toContain('is-current');
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();

    // Route C: Course Home -> 「つづきを ほる」.
    cleanup();
    renderRealShell();
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });

  it('TEST F — real Story 2 completion: only after Story 2 is genuinely played does it become COMPLETED, with Story 3 becoming CURRENT/ENTERABLE', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);
    grantFullEntitlement();
    cleanup();
    renderRealShell();
    await user.click(screen.getByText('たぬき'));

    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, chantoJson as unknown as Mission, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    await user.click(screen.getByText(ui.completeBackToMapLabel));

    // Before Story 2 is played, it must NOT be COMPLETED.
    expect(screen.getByText(genkanJson.title).closest('.course-home__depth')!.className).not.toContain('is-done');

    await user.click(screen.getByText(genkanJson.title));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, genkanJson as unknown as Mission, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    await user.click(screen.getByText(ui.completeBackToMapLabel));

    expect(screen.getByText(genkanJson.title).closest('.course-home__depth')!.className).toContain('is-done');
    const roukaDepth = screen.getByText(roukaJson.title).closest('.course-home__depth')!;
    expect(roukaDepth.className).toContain('is-current');
    await user.click(screen.getByText(roukaJson.title));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });

  it('TEST H — Bank schedule regression: all 12 Bank Digs stay locked through Story 1-3, the 7 めあて ones open at Story 1-4, the 5 わかれ ones wait for Story 1-5 — unaffected by WO-27 entitlement gating', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await createProfile(user);
    grantFullEntitlement();
    cleanup();
    renderRealShell();
    await user.click(screen.getByText('たぬき'));

    async function playCurrentStory(mission: Mission) {
      await user.click(screen.getByText(ui.courseHomeContinueLabel));
      await user.click(screen.getByText(ui.coopSolo));
      await playMissionScreenToCompletion(user, mission, ui);
      // Story 5 (minna) declares its own perspective-shift moment (WO-19 Phase 3C) — shown
      // before the completion screen when solo, exactly like the rest of this codebase's
      // playthrough helpers already account for (see tests/FullCourseJourney.test.tsx).
      if (mission.perspective) {
        await waitFor(() => expect(screen.getByText(mission.perspective!.text)).toBeInTheDocument());
        await user.click(screen.getByText(ui.handoffContinue));
      }
      await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
      await user.click(screen.getByText(ui.completeBackToMapLabel));
    }

    await playCurrentStory(chantoJson as unknown as Mission);
    await playCurrentStory(genkanJson as unknown as Mission);
    await playCurrentStory(roukaJson as unknown as Mission);

    // Architect's correction: Story 1-3 done is not enough — the Bank section itself isn't
    // visible yet, so every Bank Dig stays LOCKED.
    const bankMeate = [
      bankEscalatorJson, bankJankenJson, bankGakunenJson, bankKireiJson, bankItadakimasuJson,
      bankArigatouJson, bank100yenJson,
    ];
    const bankWakare = [bankAtodeJson, bankTeamJson, bankNedanJson, bankHoshiiJson, bankKotobaJson];
    const allBanks = [...bankMeate, ...bankWakare];
    await user.click(screen.getByText(ui.courseHomeBankLabel));
    for (const b of allBanks) {
      expect(screen.getByText(titleMatcher((b as unknown as Mission).title)).closest('button')!.className, (b as unknown as Mission).id).toContain('is-locked');
    }
    await user.click(screen.getByText(ui.bankBackButton));

    await playCurrentStory(oyatsuJson as unknown as Mission); // Story 1-4 — opens the Bank section

    // The 7 めあて Bank Digs are now available (their real prerequisite, Story 1-3, already
    // resolved); the 5 わかれ Bank Digs stay locked until Story 1-5 (minna) — their own real
    // rootType prerequisite.
    await user.click(screen.getByText(ui.courseHomeBankLabel));
    for (const b of bankMeate) {
      expect(screen.getByText(titleMatcher((b as unknown as Mission).title)).closest('button')!.className, (b as unknown as Mission).id).not.toContain('is-locked');
    }
    for (const b of bankWakare) {
      expect(screen.getByText(titleMatcher((b as unknown as Mission).title)).closest('button')!.className, (b as unknown as Mission).id).toContain('is-locked');
    }
    await user.click(screen.getByText(ui.bankBackButton));

    await playCurrentStory(minnaJson as unknown as Mission); // Story 1-5 — opens the わかれ Banks

    await user.click(screen.getByText(ui.courseHomeBankLabel));
    for (const b of bankWakare) {
      expect(screen.getByText(titleMatcher((b as unknown as Mission).title)).closest('button')!.className, (b as unknown as Mission).id).not.toContain('is-locked');
    }
  }, 20000);
});
