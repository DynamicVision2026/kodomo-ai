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

  it('a logged-in parent with no `next` param is sent to /play/ by default', async () => {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [] })),
    );
    const { LoginPage } = await import('../src/parent/login/LoginPage');

    render(<LoginPage />);

    await waitFor(() => expect(window.location.href).toBe('/play/'));
  });
});
