/**
 * AD-16 §6: MissionShell's own `POST /units/{unitId}/open` wiring — the server's answer (never a
 * client-side guess) decides whether a mission is actually entered. `tests/EntitlementSecurity.
 * test.tsx` already covers the (much more common) "no backend configured at all" fallback path,
 * unaffected by this file; every scenario here explicitly configures `VITE_FAMILY_API_URL` (via
 * `vi.stubEnv` + `vi.resetModules()`, the exact established pattern that file's own "hand-edited
 * cachedEntitlements" test already uses) so MissionShell actually takes the real network path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import type { MissionLibrary } from '../src/shell/MissionShell';
import type { AppState } from '../src/engine/storage';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json'; // m1-s2-1-1 — the free/trial unit
import genkanJson from '../src/modules/m1/topics/genkan/s2.json'; // m1-s2-1-2 — a paid unit
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;
const STORY = [chantoJson, genkanJson].map((m) => m as unknown as Mission);
const missionLibrary: MissionLibrary = {
  missionOrder: STORY.map((m) => m.id),
  missions: Object.fromEntries(STORY.map((m) => [m.id, m])),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Every fetch this suite needs to see: `/me` (MissionShell's own boot-time hydration — always
 *  answered "no session" here, so cachedEntitlements/profiles never interfere with what's under
 *  test) and `/units/{unitId}/open`, whose answer is supplied per test via `openResponder`. */
function stubBackend(openResponder: (unitId: string) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/me')) return new Response('unauthorized', { status: 401 });
    const match = url.match(/\/units\/([^/]+)\/open$/);
    if (match) return openResponder(match[1]!);
    return new Response('not found', { status: 404 });
  }));
}

async function renderConfiguredShell() {
  vi.resetModules();
  vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
  const { MissionShell } = await import('../src/shell/MissionShell');
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoJson as unknown as Mission}
      missionLibrary={missionLibrary} ui={ui}
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

/** A profile with Story 1 (m1-s2-1-1) already done, so Story 2 (m1-s2-1-2, genkan — a paid
 *  unit) is the sequentially-current depth and reachable by tapping it directly, exactly the
 *  same seeding tests/EntitlementSecurity.test.tsx's own `seedWithStory1Done` uses. */
function seedWithStory1Done(overrides: Partial<AppState> = {}) {
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

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AD-16 §6 — entering a unit calls POST /units/{unitId}/open, and its answer decides entry', () => {
  it('a successful open of the free/trial unit (1-1) sends the right body and enters real content', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return new Response('unauthorized', { status: 401 });
      if (url.endsWith('/units/m1-s2-1-1/open')) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        expect(body.moduleId).toBe('m1');
        expect(typeof body.profileId).toBe('string');
        return jsonResponse({ ok: true });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    await renderConfiguredShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));

    await waitFor(() => expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/units/m1-s2-1-1/open'), expect.anything());
  });

  it('a successful open of a paid unit (1-2) sends the right body and enters real content', async () => {
    // Course Home's own client-side "needs purchase" preview (src/shell/CourseHome.tsx's
    // `tapDepth`) still gates which depths are even TAPPABLE from cachedEntitlements, unchanged
    // by AD-16 — it only decides what the map LOOKS like, never actual entry (that's this whole
    // file's subject). A family with a genuine, already-fetched entitlement (exactly what a real
    // `/me` response would have cached) is the realistic case that reaches the tap at all; the
    // point under test is that ENTRY still goes through the real server call and its exact
    // request body, not a client-trusted shortcut straight to 'coop'.
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return new Response('unauthorized', { status: 401 });
      if (url.endsWith('/units/m1-s2-1-2/open')) {
        const body = JSON.parse(String(init?.body));
        expect(body.moduleId).toBe('m1');
        expect(typeof body.profileId).toBe('string');
        return jsonResponse({ ok: true });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    seedWithStory1Done({ cachedEntitlements: ['m1'] });

    const user = userEvent.setup();
    await renderConfiguredShell();
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(genkanJson.title));

    await waitFor(() => expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/units/m1-s2-1-2/open'), expect.anything());
  });

  it('a refused open (trial_expired) never enters coop/dig content — the locked screen shows instead', async () => {
    stubBackend(() => jsonResponse({ error: 'trial_expired' }, 403));
    const user = userEvent.setup();
    await renderConfiguredShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));

    await waitFor(() => expect(screen.getByText(ui.lockedMessage)).toBeInTheDocument());
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
  });

  it('a refused open (not_entitled) never enters content either', async () => {
    stubBackend(() => jsonResponse({ error: 'not_entitled' }, 403));
    const user = userEvent.setup();
    await renderConfiguredShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));

    await waitFor(() => expect(screen.getByText(ui.lockedMessage)).toBeInTheDocument());
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
  });

  /**
   * Hotfix regression test — reproduces exactly what the Founder saw on iPhone against
   * kodomo-ai-2igizbslpa-an.a.run.app: a guest with no session at all tapped into the free
   * trial and landed on a child-facing screen. The root cause was `enterMission` collapsing
   * `openUnit`'s `reason: 'unauthorized'` into the SAME generic locked screen as a genuine
   * entitlement refusal — AD-15 rule #4 ("a logged-out visitor is routed to sign-up/login")
   * means this must be a real navigation to `/login/`, never a screen rendered under /play at
   * all (so there is nothing here that could ever show sales copy).
   */
  it('no session at all (401 unauthorized) navigates straight to /login/, never rendering any /play screen', async () => {
    stubBackend(() => new Response('unauthorized', { status: 401 }));
    const originalLocation = window.location;
    // jsdom's window.location.href setter throws "Not implemented: navigation" — stub the whole
    // object the same way tests/ad16PurchaseCta.test.tsx already does for the Shopify redirect.
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '', pathname: '/play/', search: '' }, writable: true,
    });

    const user = userEvent.setup();
    await renderConfiguredShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));

    await waitFor(() => expect(window.location.href).toContain('/login/'));
    expect(window.location.href).toContain(`next=${encodeURIComponent('/play/')}`);
    // The definitive assertion: whatever the child was looking at a moment ago, none of it is
    // still true — there is no purchase-wall text, no coop question, nothing rendered under
    // /play at all for this case.
    expect(screen.queryByText(ui.lockedMessage)).not.toBeInTheDocument();
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  /**
   * Hotfix regression test — the SAME production incident's other half: whatever the true
   * trigger was on the Founder's device (a CORS/origin mismatch between the app's two live
   * Cloud Run hostnames is the leading candidate — `backend/src/router.ts`'s CORS answers a
   * single static `APP_ORIGIN`, and a fetch() blocked by CORS surfaces to `apiFetch` as exactly
   * this kind of thrown/caught failure), the CHILD must never be told "please purchase" for an
   * infrastructure problem nothing here actually knows the cause of.
   */
  it("a network failure never shows the purchase-wall screen — it's a connection error, not an entitlement one", async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return new Response('unauthorized', { status: 401 });
      throw new Error('simulated network failure (e.g. a CORS-blocked cross-origin fetch)');
    }));
    const user = userEvent.setup();
    await renderConfiguredShell();
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));

    await waitFor(() => expect(screen.getByText(ui.connectionErrorMessage)).toBeInTheDocument());
    expect(screen.queryByText(ui.lockedMessage)).not.toBeInTheDocument();
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
  });
});
