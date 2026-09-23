/**
 * AD-13: the entitlement security regression suite for the Family Account model. WO-30's own
 * "redeemedCode + reconcileEntitlements" cross-check is gone along with the rest of the
 * unlock-code system it protected — the new, simpler security boundary (src/engine/
 * entitlements.ts's own doc comment) is that `AppState.cachedEntitlements` is written ONLY from
 * a real `/me` response (src/family/session.ts's `hydrateFromServer`), which MissionShell already
 * calls once per mount. Every scenario below seeds a profile with Story 1 already done, so Story
 * 2 is the sequentially-current depth and CourseHome's own needsPurchase logic — not the separate
 * "not reached yet" sequential lock — is what's actually under test.
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

function renderRealShell() {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoJson as unknown as Mission}
      missionLibrary={missionLibrary} ui={ui}
    />,
  );
}

/** A profile with Story 1 already done, so Story 2 is the sequentially-current depth and
 *  whatever `overrides` says about entitlement is what actually decides whether it's enterable. */
function seedWithStory1Done(overrides: Partial<AppState>) {
  const state: AppState = {
    profiles: [{
      id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2,
      progress: { [chantoJson.id]: { done: true, stamps: 1, coop: false } },
      milestones: { M0: { achieved: true, achievedAt: 0 } },
    }],
    familyId: null,
    cachedEntitlements: [],
    pendingSyncKeys: [],
    abVariant: 'A',
    deviceId: 'd1',
    ...overrides,
  };
  localStorage.setItem('m-app.v2', JSON.stringify(state));
}

async function enterAsExistingProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('たぬき'));
}

/** No `/me` response, ever — the same as `VITE_FAMILY_API_URL` being unset (every build until
 *  the backend is actually deployed behind the custom domain). */
function stubNoBackend() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('not configured in this test')));
}

describe('AD-13 — FREE family', () => {
  it('Mission 1 (the free Story) is fully reachable with no entitlement at all', async () => {
    stubNoBackend();
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

  it('paid content (Story 2) is locked with no cached entitlement, even with Story 1 already done', async () => {
    stubNoBackend();
    seedWithStory1Done({});
    const user = userEvent.setup();
    renderRealShell();
    await enterAsExistingProfile(user);
    const genkanDepth = screen.getByText(genkanJson.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).toContain('is-locked');
    expect(genkanDepth.className).not.toContain('is-current');
  });
});

describe('AD-13 — cachedEntitlements is a cache, not the authority', () => {
  it('a hand-edited cachedEntitlements is corrected the moment a real /me response disagrees', async () => {
    seedWithStory1Done({ cachedEntitlements: ['m1'] }); // the exact forgery: no real family behind it
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        familyId: 'f1',
        email: 'p***@example.com',
        entitlements: [],
        // The server confirms profile p1 exists (so hydration doesn't wipe it out from under
        // the family) but grants it no entitlements — the actual forgery this test checks for.
        profiles: [{ id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 }],
      }),
    }));

    // MissionShell's boot-time effect reads src/family/api.ts's own module-level
    // `VITE_FAMILY_API_URL` constant, captured at import time — vi.stubEnv alone has no effect
    // on an already-loaded module, so this (like tests/UnlockPage.test.tsx's own equivalent
    // pattern, before it was retired) resets the module registry and re-imports MissionShell
    // fresh, with the env var actually stubbed before that import happens.
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    const { MissionShell: MissionShellConfigured } = await import('../src/shell/MissionShell');

    const user = userEvent.setup();
    render(
      <MissionShellConfigured
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoJson as unknown as Mission}
        missionLibrary={missionLibrary} ui={ui}
      />,
    );
    await enterAsExistingProfile(user);

    // Immediately after mount the stale cache may still show Story 2 as current — that's the
    // narrow, expected window; what matters is that it's gone once the real check settles.
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
      expect(saved.cachedEntitlements).not.toContain('m1');
    });

    cleanup();
    vi.unstubAllEnvs();
    stubNoBackend();
    renderRealShell();
    await enterAsExistingProfile(user);
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getAllByText(ui.lockedMessage).length).toBeGreaterThan(0);
  });

  it('a real cached entitlement (the shape a genuine /me response writes) unlocks Story 2', async () => {
    stubNoBackend();
    seedWithStory1Done({ cachedEntitlements: ['m1'] });
    const user = userEvent.setup();
    renderRealShell();
    await enterAsExistingProfile(user);

    const genkanDepth = screen.getByText(genkanJson.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).toContain('is-current');
    expect(genkanDepth.className).not.toContain('is-locked');
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument(); // entered for real, not locked
  });

  it('reload/browser-restart safe: the same cached entitlement still works with no backend configured', async () => {
    stubNoBackend();
    seedWithStory1Done({ cachedEntitlements: ['m1'] });
    const user = userEvent.setup();
    renderRealShell();
    await enterAsExistingProfile(user);
    await user.click(screen.getByText(genkanJson.title));
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });
});

describe('AD-13 — Home Kit reachable for an entitled family through the Print Centre', () => {
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
