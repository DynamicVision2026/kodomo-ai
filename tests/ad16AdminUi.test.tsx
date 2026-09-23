/**
 * AD-16 §8: the admin dashboard's own frontend (src/admin/*) — role-based UI restrictions
 * (viewer sees masked data and no mutating controls; operator sees the real thing and can act)
 * and the "every operator write requires a reason" rule, enforced client-side by ReasonButton
 * before the request is even sent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminApp } from '../src/admin/AdminApp';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setUrl(path: string) {
  window.history.pushState({}, '', path);
}

const FAMILY_DETAIL_MASKED = {
  familyId: 'fam-1', email: 'p***@example.com', createdAt: '2026-01-01T00:00:00.000Z', status: 'active',
  profiles: [], trials: [], entitlements: [{ moduleId: 'm1', status: 'active', shopifyOrderId: 'o1', grantedAt: '2026-01-01T00:00:00.000Z', revokedAt: null }],
  orders: [], sessions: [],
};
const FAMILY_DETAIL_UNMASKED = { ...FAMILY_DETAIL_MASKED, email: 'parent@example.com' };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setUrl('/');
});

describe('AD-16 §8 — admin UI: viewer vs operator restrictions', () => {
  it('a viewer sees the masked email and no mutating controls at all', async () => {
    setUrl('/?view=family&id=fam-1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/admin-api/me')) return jsonResponse({ email: 'viewer@example.com', role: 'viewer' });
      if (url.includes('/admin-api/families/fam-1')) return jsonResponse(FAMILY_DETAIL_MASKED);
      return new Response('not found', { status: 404 });
    }));

    render(<AdminApp />);
    await waitFor(() => expect(screen.getByText('p***@example.com')).toBeInTheDocument());
    expect(screen.getByText('閲覧のみ')).toBeInTheDocument();
    // No operator action anywhere on the page — not "無効化", not "ウェルカムメールを再送", nothing.
    expect(screen.queryByText('無効化')).not.toBeInTheDocument();
    expect(screen.queryByText('ウェルカムメールを再送')).not.toBeInTheDocument();
    expect(screen.queryByText('メールアドレスの変更')).not.toBeInTheDocument();
  });

  it('an operator sees the real email and the full set of mutating controls', async () => {
    setUrl('/?view=family&id=fam-1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/admin-api/me')) return jsonResponse({ email: 'operator@example.com', role: 'operator' });
      if (url.includes('/admin-api/families/fam-1')) return jsonResponse(FAMILY_DETAIL_UNMASKED);
      return new Response('not found', { status: 404 });
    }));

    render(<AdminApp />);
    await waitFor(() => expect(screen.getByText('parent@example.com')).toBeInTheDocument());
    expect(screen.getByText('操作者')).toBeInTheDocument();
    expect(screen.getByText('無効化')).toBeInTheDocument();
    expect(screen.getByText('ウェルカムメールを再送')).toBeInTheDocument();
  });
});

describe('AD-16 §8 — admin UI: operator writes require a reason', () => {
  it('the confirm button stays disabled until a reason is typed, and the request body carries it', async () => {
    let capturedBody: unknown = null;
    setUrl('/?view=family&id=fam-1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/admin-api/me')) return jsonResponse({ email: 'operator@example.com', role: 'operator' });
      if (url.includes('/admin-api/families/fam-1') && method === 'GET') return jsonResponse(FAMILY_DETAIL_UNMASKED);
      if (url.includes('/entitlements/m1') && method === 'POST') {
        capturedBody = JSON.parse(String(init?.body));
        return jsonResponse({ familyId: 'fam-1', moduleId: 'm1', status: 'revoked' });
      }
      return new Response('not found', { status: 404 });
    }));

    const user = userEvent.setup();
    render(<AdminApp />);
    await waitFor(() => expect(screen.getByText('parent@example.com')).toBeInTheDocument());

    await user.click(screen.getByText('無効化'));
    const confirmButton = await screen.findByText('無効化を実行');
    expect(confirmButton).toBeDisabled();

    const reasonInput = screen.getByPlaceholderText(/保護者からの問い合わせ/);
    await user.type(reasonInput, '重複購入のため');
    expect(confirmButton).not.toBeDisabled();

    await user.click(confirmButton);
    await waitFor(() => expect(capturedBody).toEqual({ status: 'revoked', reason: '重複購入のため' }));
  });

  it('a write attempted with an empty reason never reaches the network at all', async () => {
    let entitlementCallCount = 0;
    setUrl('/?view=family&id=fam-1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/admin-api/me')) return jsonResponse({ email: 'operator@example.com', role: 'operator' });
      if (url.includes('/admin-api/families/fam-1') && method === 'GET') return jsonResponse(FAMILY_DETAIL_UNMASKED);
      if (url.includes('/entitlements/m1') && method === 'POST') {
        entitlementCallCount += 1;
        return jsonResponse({});
      }
      return new Response('not found', { status: 404 });
    }));

    const user = userEvent.setup();
    render(<AdminApp />);
    await waitFor(() => expect(screen.getByText('parent@example.com')).toBeInTheDocument());
    await user.click(screen.getByText('無効化'));
    // Try clicking the (disabled) confirm button directly — userEvent respects `disabled` and
    // refuses to fire the click at all, exactly what a real browser does.
    await user.click(screen.getByText('無効化を実行'));
    expect(entitlementCallCount).toBe(0);
  });
});

describe('AD-16 §8 — admin UI: navigation across the five surfaces', () => {
  it('search -> family -> order, and the standing nav reaches queues and audit', async () => {
    setUrl('/');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/admin-api/me')) return jsonResponse({ email: 'operator@example.com', role: 'operator' });
      if (url.includes('/admin-api/search')) {
        return jsonResponse({ families: [{ familyId: 'fam-1', email: 'parent@example.com' }], orders: [] });
      }
      if (url.includes('/admin-api/families/fam-1')) return jsonResponse(FAMILY_DETAIL_UNMASKED);
      if (url.includes('/admin-api/queues/')) return jsonResponse([]);
      return new Response('not found', { status: 404 });
    }));

    const user = userEvent.setup();
    render(<AdminApp />);
    await waitFor(() => expect(screen.getByPlaceholderText(/parent@example.com/)).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/parent@example.com/);
    await user.type(searchInput, 'parent@example.com');
    const form = searchInput.closest('form')!;
    await user.click(within(form).getByRole('button', { name: '検索' }));
    const familyRow = await screen.findByText('fam-1');
    await user.click(familyRow);

    await waitFor(() => expect(screen.getByText('家族: fam-1')).toBeInTheDocument());

    const nav = screen.getByRole('navigation');
    await user.click(within(nav).getByText('キュー'));
    await waitFor(() => expect(screen.getByText('該当する注文はありません。')).toBeInTheDocument());

    await user.click(within(nav).getByText('監査ログ'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '監査ログ' })).toBeInTheDocument());
  });
});
