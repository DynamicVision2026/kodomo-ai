/**
 * WO-30 §11 A-C, F-G: the commercial-release security regression suite. §11 D/E (payment
 * confirmation grants entitlement exactly once / duplicate webhook is harmless) are already
 * covered end to end by tests/workerHandlers.test.ts's "is idempotent" test — real backend
 * idempotency, not re-tested here. §11 I (existing Core behavior intact) is the full suite this
 * file is part of, all green. This file covers the one thing WO-30 actually changed: the
 * frontend's entitlement cache can no longer be trusted on its own (src/engine/entitlements.ts's
 * reconcileEntitlements(), src/shell/MissionShell.tsx's boot-time re-verification effect).
 *
 * Every scenario below seeds a profile with Story 1 ALREADY marked done (`progress`), so Story 2
 * is genuinely the sequentially-current depth and CourseHome's own needsPurchase logic — not the
 * separate, purely-sequential "not reached yet" lock — is what's actually under test. Playing
 * Story 1 for real through the UI in every case would prove nothing more about entitlement and
 * cost a full dig-grammar playthrough per test; the real playthrough itself is already exercised
 * end to end by tests/WO27ProgressionConsistency.test.tsx and tests/GoldenConformance.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import { PrintCentre } from '../src/print/centre/PrintCentre';
import { homeKitPackage } from '../src/print/kit-data/homeKitPackage';
import printCentreUi from '../src/print/kit-data/print-centre-ui.json';
import type { MissionLibrary } from '../src/shell/MissionShell';
import type { AppState } from '../src/engine/storage';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanJson from '../src/modules/m1/topics/genkan/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;
const STORY = [chantoJson, genkanJson].map((m) => m as unknown as Mission);
const missionLibrary: MissionLibrary = {
  missionOrder: STORY.map((m) => m.id),
  missions: Object.fromEntries(STORY.map((m) => [m.id, m])),
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Real production wiring — freeMissionIds covers only chanto (Story 1), no familyTestMode.
 *  `unlockApiBaseUrl` defaults undefined (no backend deployed), matching every real build until
 *  VITE_UNLOCK_API_URL is actually set — a test that needs the boot-time re-verification to
 *  fire passes one explicitly. */
function renderRealShell(unlockApiBaseUrl?: string) {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoJson as unknown as Mission}
      missionLibrary={missionLibrary} ui={ui}
      unlockApiBaseUrl={unlockApiBaseUrl}
    />,
  );
}

/** A profile with Story 1 already done, so Story 2 is the sequentially-current depth and
 *  whatever `overrides` says about entitlement is what actually decides whether it's enterable
 *  — never the separate "not reached yet" sequential lock. */
function seedWithStory1Done(overrides: Partial<AppState>) {
  const state: AppState = {
    profiles: [{
      id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2,
      progress: { [chantoJson.id]: { done: true, stamps: 1, coop: false } },
      milestones: { M0: { achieved: true, achievedAt: 0 } },
    }],
    entitlements: ['m1:free'],
    redeemedCode: null,
    founder: false,
    abVariant: 'A',
    deviceId: 'd1',
    ...overrides,
  };
  localStorage.setItem('m-app.v1', JSON.stringify(state));
}

async function enterAsExistingProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('たぬき'));
}

describe('WO-30 §11 A — FREE family', () => {
  it('Mission 1 (the free Story) is fully reachable with no entitlement at all', async () => {
    const user = userEvent.setup();
    renderRealShell();
    await user.click(screen.getByText('あたらしく つくる'));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await skipM0RitualIfPresent(user, ui);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument(); // reached the real mission, not the locked screen
  });

  it('paid content (Story 2) cannot be unlocked by directly editing localStorage', async () => {
    seedWithStory1Done({});
    const user = userEvent.setup();
    renderRealShell();
    await enterAsExistingProfile(user);

    // The exact attack WO-30 §0 names: hand-edit the entitlements array, no redeemedCode.
    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    saved.entitlements = ['m1:free', 'm1:full'];
    localStorage.setItem('m-app.v1', JSON.stringify(saved));
    cleanup();

    renderRealShell();
    await enterAsExistingProfile(user);
    const genkanDepth = screen.getByText(genkanJson.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).toContain('is-locked');
    expect(genkanDepth.className).not.toContain('is-current');
  });
});

describe('WO-30 §11 C — FORGED CLIENT', () => {
  it('a bare "m1:full" with no redeemedCode never unlocks Story 2', async () => {
    seedWithStory1Done({ entitlements: ['m1:free', 'm1:full'], redeemedCode: null });
    const user = userEvent.setup();
    renderRealShell();
    await enterAsExistingProfile(user);

    const genkanDepth = screen.getByText(genkanJson.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).toContain('is-locked');
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getAllByText(ui.lockedMessage).length).toBeGreaterThan(0); // the real entitlement message, not the sequential one
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
  });

  it('a forged redeemedCode + cached entitlement is self-corrected once the backend says not_found', async () => {
    seedWithStory1Done({ entitlements: ['m1:free', 'm1:full'], redeemedCode: 'NAZE-MADE-UPXX' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const user = userEvent.setup();
    renderRealShell('https://backend.example'); // a configured backend, so the boot effect fires
    await enterAsExistingProfile(user);

    // Immediately after mount the stale cache may still show Story 2 as current — that's the
    // narrow, expected window; what matters is that it's gone once the real check settles.
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
      expect(saved.entitlements).not.toContain('m1:full');
      expect(saved.redeemedCode).toBeNull();
    });

    cleanup();
    renderRealShell();
    await enterAsExistingProfile(user);
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getAllByText(ui.lockedMessage).length).toBeGreaterThan(0);
  });
});

describe('WO-30 §11 B — PAID family', () => {
  it('a real redeemedCode (the shape a genuine /play/unlock redemption writes) unlocks Story 2', async () => {
    seedWithStory1Done({ entitlements: ['m1:free', 'm1:full'], redeemedCode: 'NAZE-REAL-CODE' });
    const user = userEvent.setup();
    renderRealShell();
    await enterAsExistingProfile(user);

    const genkanDepth = screen.getByText(genkanJson.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).toContain('is-current');
    expect(genkanDepth.className).not.toContain('is-locked');
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument(); // entered for real, not locked
  });

  it('reload/browser-restart safe: the SAME cached entitlement still works on a fresh mount with no backend configured', async () => {
    seedWithStory1Done({ entitlements: ['m1:free', 'm1:full'], redeemedCode: 'NAZE-REAL-CODE' });
    const user = userEvent.setup();
    renderRealShell(); // no unlockApiBaseUrl — offline/undeployed, same as every build today
    await enterAsExistingProfile(user);
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });
});

describe('WO-30 §11 F/G — recovery, and never another family\'s entitlement', () => {
  it('F: a valid purchaser recovers access after clearing local state, by re-entering their real code on /play/unlock', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ moduleIds: ['m1'], founder: false, overCap: false }),
    }));
    const user = userEvent.setup();
    // Simulate VITE_UNLOCK_API_URL being configured by re-importing UnlockPage with the env
    // stubbed, the same pattern tests/UnlockPage.test.tsx itself establishes.
    vi.resetModules();
    vi.stubEnv('VITE_UNLOCK_API_URL', 'https://backend.example');
    const { UnlockPage: UnlockPageConfigured } = await import('../src/parent/unlock/UnlockPage');
    const { unmount } = render(<UnlockPageConfigured />);
    await user.type(screen.getByLabelText('家族用コード'), 'NAZE-REAL-CODE');
    await user.click(screen.getByRole('button', { name: '登録する' }));
    await screen.findByText(/登録が完了しました/);
    unmount();
    vi.unstubAllEnvs();

    // Give the just-redeemed profile Story 1 done too (matching a family that had already
    // played Story 1 before losing local state) so Story 2 is the sequentially-current depth.
    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    saved.profiles = [{
      id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2,
      progress: { [chantoJson.id]: { done: true, stamps: 1, coop: false } },
      milestones: { M0: { achieved: true, achievedAt: 0 } },
    }];
    localStorage.setItem('m-app.v1', JSON.stringify(saved));

    // A fresh MissionShell mount (the "device restored" moment) reads the SAME localStorage key
    // UnlockPage just wrote and now unlocks Story 2 through the real entry gate.
    renderRealShell();
    await enterAsExistingProfile(user);
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });

  it('G: a non-purchaser typing an unrecognized code never gains access — never another family\'s entitlement', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const user = userEvent.setup();
    vi.resetModules();
    vi.stubEnv('VITE_UNLOCK_API_URL', 'https://backend.example');
    const { UnlockPage: UnlockPageConfigured } = await import('../src/parent/unlock/UnlockPage');
    const { unmount } = render(<UnlockPageConfigured />);
    await user.type(screen.getByLabelText('家族用コード'), 'NAZE-NOT-MINE');
    await user.click(screen.getByRole('button', { name: '登録する' }));
    await screen.findByText(/コードが見つかりませんでした/);
    unmount();
    vi.unstubAllEnvs();

    expect(localStorage.getItem('m-app.v1')).toBeNull(); // nothing was ever written

    seedWithStory1Done({});
    renderRealShell();
    await enterAsExistingProfile(user);
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getAllByText(ui.lockedMessage).length).toBeGreaterThan(0);
  });
});

describe('WO-30 §11 H — Home Kit reachable for an entitled family through the Print Centre', () => {
  it('lists a direct download link for every WO-29 deliverable, plus the complete ZIP', () => {
    render(<PrintCentre ui={printCentreUi} pkg={homeKitPackage} baseUrl="/kit" />);

    const zipLink = screen.getByText(printCentreUi.zipButtonLabel).closest('a')!;
    expect(zipLink).toHaveAttribute('href', `/kit/${homeKitPackage.zipBaseName}.zip`);

    for (const folder of homeKitPackage.folders) {
      for (const item of folder.items) {
        const link = screen.getByText(item.fileName).closest('a')!;
        expect(link).toHaveAttribute('href', `/kit/${folder.id}/${item.fileName}`);
      }
    }
  });
});
