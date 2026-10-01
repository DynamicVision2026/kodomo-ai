import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

let originalLocation: Location;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubLocation(search = ''): void {
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, href: '', search },
    writable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
});

describe('LoginPage', () => {
  it('checks the session before showing anything, and shows the email form once it knows there is none', async () => {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'not_authenticated' }, 401)));
    const { LoginPage } = await import('../src/parent/login/LoginPage');

    render(<LoginPage />);

    // Post-launch-check fix: no code prompt (or anything else) before the /me check resolves.
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument());
  });

  it('a logged-in parent hitting /login/ directly is bounced straight to `next` — never sees the form', async () => {
    vi.resetModules();
    stubLocation('?next=/account/');
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [] })),
    );
    const { LoginPage } = await import('../src/parent/login/LoginPage');

    render(<LoginPage />);

    await waitFor(() => expect(window.location.href).toBe('/account/'));
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });

  it('a logged-in parent with no `next` param, and the course not visible to them, is sent to /play/', async () => {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: false })),
    );
    const { LoginPage } = await import('../src/parent/login/LoginPage');

    render(<LoginPage />);

    await waitFor(() => expect(window.location.href).toBe('/play/'));
  });

  it('post-launch-check fix (Founder report): a logged-in parent with no `next` param, course visible via VITE_BEGINNER_LAUNCH, is sent to /course/beginner/ — never /account/', async () => {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubEnv('VITE_BEGINNER_LAUNCH', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: false })),
    );
    const { LoginPage } = await import('../src/parent/login/LoginPage');

    render(<LoginPage />);

    await waitFor(() => expect(window.location.href).toBe('/course/beginner/'));
  });

  it('a logged-in parent with no `next` param, course visible via this family\'s own courseAllowed grant (allowlist/preview email), is sent to /course/beginner/', async () => {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: true })),
    );
    const { LoginPage } = await import('../src/parent/login/LoginPage');

    render(<LoginPage />);

    await waitFor(() => expect(window.location.href).toBe('/course/beginner/'));
  });

  it('email-redesign (Founder, 1 Oct 2026), item 6: `?email=` pre-fills the field for a not-logged-in parent, without auto-submitting — a code is still required every time', async () => {
    vi.resetModules();
    stubLocation('?email=parent%40example.com&next=/course/beginner/');
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'not_authenticated' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const { LoginPage } = await import('../src/parent/login/LoginPage');

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('メールアドレス')).toHaveValue('parent@example.com'));
    // Only the one /me check fired — no login-code request went out on its own.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('an explicit `?next=/account/` still wins even when the course is visible to this family — never silently overridden', async () => {
    vi.resetModules();
    stubLocation('?next=/account/');
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubEnv('VITE_BEGINNER_LAUNCH', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: true })),
    );
    const { LoginPage } = await import('../src/parent/login/LoginPage');

    render(<LoginPage />);

    await waitFor(() => expect(window.location.href).toBe('/account/'));
  });
});
