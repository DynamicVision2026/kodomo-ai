/**
 * WO-C6 B2 #12 item 2: the account page's purchase-status line reads 「ナゼホリ Module 1」 with the
 * flag off (today's real deploy state) and 「ナゼホリ 入門コース」 once BEGINNER_LAUNCH is on — same
 * COPY-01 naming-table mechanism tests/LegalPages.test.tsx already proves for TokushohoPage's own
 * 商品名. Uses the same vi.resetModules()/vi.stubEnv()/vi.stubGlobal('fetch', ...) pattern
 * tests/ad16PurchaseCta.test.tsx established for this exact page.
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

function stubFetchEntitled() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/me')) return jsonResponse(ME_ENTITLED);
    if (url.endsWith('/sessions')) return jsonResponse([]);
    return new Response('not found', { status: 404 });
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AccountPage purchase-status label (COPY-01)', () => {
  it('flag off (today\'s real deploy state): reads 「ナゼホリ Module 1」', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    stubFetchEntitled();
    const { AccountPage } = await import('../src/parent/account/AccountPage');
    render(<AccountPage />);
    await waitFor(() => expect(screen.getByText(/ご購入済み/)).toBeInTheDocument());
    expect(screen.getByText(/ナゼホリ Module 1/)).toBeInTheDocument();
    expect(screen.queryByText(/入門コース/)).not.toBeInTheDocument();
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
});
