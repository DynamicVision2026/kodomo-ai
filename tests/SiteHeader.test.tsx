/**
 * Post-launch-check (Founder, domo-ai.com): src/ad12/SiteHeader.tsx — the small Course Home /
 * garden header (ナゼホリ · プレイグラウンド / 入門コース · アカウント · ログアウト). Uses the
 * same `vi.resetModules()` + `vi.stubEnv('VITE_FAMILY_API_URL', ...)` pattern as
 * tests/LoginPage.test.tsx / tests/ad16PurchaseCta.test.tsx.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const UI = {
  brandLabel: 'ナゼホリ',
  playgroundLabel: 'プレイグラウンド',
  courseLabel: '入門コース',
  accountLabel: 'アカウント',
  logoutLabel: 'ログアウト',
};

const ME_COURSE_NOT_ALLOWED = { familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: false };
const ME_COURSE_ALLOWED = { familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: true };

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SiteHeader', () => {
  it('renders nothing at all when no real family-account backend is configured (local dev / every other existing test)', async () => {
    vi.resetModules();
    const { SiteHeader } = await import('../src/ad12/SiteHeader');
    const { container } = render(<SiteHeader ui={UI} current="playground" homeHref="/play/" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('on the Playground with the course not visible: shows brand/account/logout but no course switch at all', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(ME_COURSE_NOT_ALLOWED)));
    const { SiteHeader } = await import('../src/ad12/SiteHeader');
    render(<SiteHeader ui={UI} current="playground" homeHref="/play/" />);

    expect(screen.getByRole('link', { name: 'ナゼホリ' })).toHaveAttribute('href', '/play/');
    expect(screen.getByText('プレイグラウンド')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('入門コース')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'アカウント' })).toHaveAttribute('href', '/account/');
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
  });

  it('on the Playground once the course becomes visible (me.courseAllowed): 入門コース appears as a link to /course/beginner/', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(ME_COURSE_ALLOWED)));
    const { SiteHeader } = await import('../src/ad12/SiteHeader');
    render(<SiteHeader ui={UI} current="playground" homeHref="/play/" />);

    await waitFor(() => expect(screen.getByRole('link', { name: '入門コース' })).toHaveAttribute('href', '/course/beginner/'));
    // The current surface (プレイグラウンド) is plain text, never a link to itself.
    expect(screen.queryByRole('link', { name: 'プレイグラウンド' })).not.toBeInTheDocument();
  });

  it('behind VITE_BEGINNER_LAUNCH=1, the course switch shows immediately without waiting on /me', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubEnv('VITE_BEGINNER_LAUNCH', '1');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(ME_COURSE_NOT_ALLOWED)));
    const { SiteHeader } = await import('../src/ad12/SiteHeader');
    render(<SiteHeader ui={UI} current="playground" homeHref="/play/" />);

    expect(screen.getByRole('link', { name: '入門コース' })).toHaveAttribute('href', '/course/beginner/');
  });

  it('on the course garden: プレイグラウンド is always a link to /play/, 入門コース is the current (plain-text) surface', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(ME_COURSE_ALLOWED)));
    const { SiteHeader } = await import('../src/ad12/SiteHeader');
    render(<SiteHeader ui={UI} current="course" homeHref="/course/beginner/" />);

    expect(screen.getByRole('link', { name: 'ナゼホリ' })).toHaveAttribute('href', '/course/beginner/');
    expect(screen.getByRole('link', { name: 'プレイグラウンド' })).toHaveAttribute('href', '/play/');
    expect(screen.queryByRole('link', { name: '入門コース' })).not.toBeInTheDocument();
    expect(screen.getByText('入門コース')).toBeInTheDocument();
  });

  it('ログアウト calls logout() then sends the browser to /', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(ME_COURSE_NOT_ALLOWED);
      if (url.endsWith('/auth/logout')) return jsonResponse({});
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true });

    const { SiteHeader } = await import('../src/ad12/SiteHeader');
    const user = userEvent.setup();
    render(<SiteHeader ui={UI} current="playground" homeHref="/play/" />);

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.anything()));
    await waitFor(() => expect(window.location.href).toBe('/'));
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });
});
