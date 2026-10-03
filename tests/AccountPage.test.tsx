/**
 * WO-C7 item 11 (Founder, 3 Oct 2026): "Module 1" is retired everywhere except the landing-page
 * FAQ's own old-buyer question — this account-page purchase-status line now always reads
 * 「ナゼホリ 入門コース」, regardless of BEGINNER_LAUNCH (supersedes WO-C6 B2 #12 item 2's flag-gated
 * "Module 1"/"入門コース" split). Uses the same vi.resetModules()/vi.stubEnv()/
 * vi.stubGlobal('fetch', ...) pattern tests/ad16PurchaseCta.test.tsx established for this page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const ME_ENTITLED: unknown = {
  familyId: 'f1', email: 'p***@example.com',
  entitlements: [{ moduleId: 'm1', status: 'active', grantedAt: '2026-09-20T03:00:00.000Z' }],
  profiles: [], trials: [],
};

const ME_ENTITLED_PREVIEW: unknown = { ...(ME_ENTITLED as object), courseAllowed: true };

function stubFetchEntitled(me: unknown = ME_ENTITLED) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/me')) return jsonResponse(me);
    if (url.endsWith('/sessions')) return jsonResponse([]);
    return new Response('not found', { status: 404 });
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AccountPage purchase-status label (WO-C7 item 11)', () => {
  it('flag off: reads 「ナゼホリ 入門コース」, never "Module 1"', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    stubFetchEntitled();
    const { AccountPage } = await import('../src/parent/account/AccountPage');
    render(<AccountPage />);
    await waitFor(() => expect(screen.getByText(/ご購入済み/)).toBeInTheDocument());
    expect(screen.getByText(/ナゼホリ 入門コース/)).toBeInTheDocument();
    expect(screen.queryByText(/Module 1/)).not.toBeInTheDocument();
  });

  it('flag on: reads 「ナゼホリ 入門コース」, never the retired "Module 1" name', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubEnv('VITE_BEGINNER_LAUNCH', '1');
    stubFetchEntitled();
    const { AccountPage } = await import('../src/parent/account/AccountPage');
    render(<AccountPage />);
    await waitFor(() => expect(screen.getByText(/ご購入済み/)).toBeInTheDocument());
    expect(screen.getByText(/ナゼホリ 入門コース/)).toBeInTheDocument();
    expect(screen.queryByText(/Module 1/)).not.toBeInTheDocument();
  });

  it('global flag off, but me.courseAllowed (a COURSE_PREVIEW_EMAILS family): still reads 「ナゼホリ 入門コース」', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    stubFetchEntitled(ME_ENTITLED_PREVIEW);
    const { AccountPage } = await import('../src/parent/account/AccountPage');
    render(<AccountPage />);
    await waitFor(() => expect(screen.getByText(/ご購入済み/)).toBeInTheDocument());
    expect(screen.getByText(/ナゼホリ 入門コース/)).toBeInTheDocument();
    expect(screen.queryByText(/Module 1/)).not.toBeInTheDocument();
  });
});
