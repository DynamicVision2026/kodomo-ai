/**
 * Item 9 (Founder, 1 Oct 2026): a manual bind on the admin dashboard moves purchase access to a
 * family account WITHOUT the usual login-code verification step, so the operator must be told to
 * confirm the purchaser's identity first — see src/admin/OrderView.tsx's reminder, shown above the
 * bind control whenever an order has no `familyId` yet.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { AdminApp } from '../src/admin/AdminApp';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setUrl(path: string) {
  window.history.pushState({}, '', path);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setUrl('/');
});

const UNBOUND_ORDER = {
  shopifyOrderId: 'o-9001', orderName: '#9001', lines: [{ sku: 'kodomo-ai-m1', variantId: 111, moduleId: 'm1', quantity: 1, lineTotal: 9800 }],
  currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: '2026-01-01T00:00:00.000Z', paidAt: '2026-01-01T00:00:00.000Z',
  purchaserEmail: 'buyer@example.com', familyId: null, bindingMethod: null, bindingState: 'awaiting_claim', entitlementState: 'none',
  trialConverted: false,
  refund: { requestedAt: null, requestChannel: null, eligibilitySnapshot: null, decision: null, shopifyRefundIds: [], refundedAt: null, refundedAmount: null, state: 'none' },
  webhookIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  amountTotal: 9800, shopifyAdminUrl: null,
};

describe('item 9 — admin manual-bind operator reminder', () => {
  it('an operator viewing an unbound order sees the identity-confirmation reminder above the bind control', async () => {
    setUrl('/?view=order&id=o-9001');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/admin-api/me')) return jsonResponse({ email: 'operator@example.com', role: 'operator' });
      if (url.includes('/admin-api/orders/o-9001')) return jsonResponse(UNBOUND_ORDER);
      return new Response('not found', { status: 404 });
    }));

    render(<AdminApp />);
    await waitFor(() => expect(screen.getByPlaceholderText('家族ID')).toBeInTheDocument());
    const notice = screen.getByText(
      '購入時のメールアドレス宛てに、info@ から本人確認のメールを送り、返信を確認してから紐づけてください。',
    );
    expect(notice).toBeInTheDocument();
    const bindButton = screen.getByText('この家族に紐付ける');
    expect(notice.compareDocumentPosition(bindButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a viewer sees no bind control (and so no reminder either) — read-only role', async () => {
    setUrl('/?view=order&id=o-9001');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/admin-api/me')) return jsonResponse({ email: 'viewer@example.com', role: 'viewer' });
      if (url.includes('/admin-api/orders/o-9001')) return jsonResponse(UNBOUND_ORDER);
      return new Response('not found', { status: 404 });
    }));

    render(<AdminApp />);
    await waitFor(() => expect(screen.getByText(/#9001/)).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('家族ID')).not.toBeInTheDocument();
    expect(screen.queryByText(/本人確認のメールを送り/)).not.toBeInTheDocument();
  });
});
