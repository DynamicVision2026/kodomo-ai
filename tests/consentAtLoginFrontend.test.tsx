/**
 * Consent at login (PURCHASE-FLOW.md v2), frontend half: the /login screen shows the consent text
 * BEFORE a code is requested, the one button is 「同意して、コードを送る」 and the request it sends
 * carries the consent text version; the landing buy button goes login-first and then straight on
 * to Shopify with the purchase token (via /account/?buy=1).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import {
  CONSENT_BUTTON_LABEL, CONSENT_CONTACT_EMAIL, CONSENT_DECLINE_NOTE, CONSENT_LEAD, CONSENT_LINKS,
  CONSENT_NO_MARKETING_NOTE, CONSENT_RECORD_NOTE,
} from '../src/legal/consentText';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let originalLocation: Location;
function stubLocation(search = ''): void {
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, href: '', search, pathname: '/login/' },
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (originalLocation) Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
});

const NOT_SIGNED_IN = () => jsonResponse({ error: 'not_authenticated' }, 401);

describe('/login — consent text before the code is sent', () => {
  it('shows the consent text and the 「同意して、コードを送る」 button on the email step', async () => {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async () => NOT_SIGNED_IN()));
    const { LoginPage } = await import('../src/parent/login/LoginPage');
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument());
    expect(screen.getByText(CONSENT_LEAD)).toBeInTheDocument();
    // Every consent link opens in a new tab (never navigating away from the consent step).
    for (const link of CONSENT_LINKS) {
      const anchor = screen.getByRole('link', { name: link.label });
      expect(anchor).toHaveAttribute('href', link.href);
      expect(anchor).toHaveAttribute('target', '_blank');
      expect(anchor.getAttribute('rel')).toContain('noopener');
    }
    // Three notes sit UNDER the button — record note, then no-marketing note, then the decline
    // note with the contact address — per text C v3 (Founder decision, 1 Oct 2026).
    const button = screen.getByRole('button', { name: '同意して、コードを送る' });
    const notes = screen.getAllByText((_, el) => el?.className === 'login__consent-note');
    expect(notes).toHaveLength(3);
    const [recordNote, noMarketingNote, declineNote] = notes;
    expect(recordNote!.textContent).toBe(CONSENT_RECORD_NOTE);
    expect(noMarketingNote!.textContent).toBe(CONSENT_NO_MARKETING_NOTE);
    expect(declineNote!.textContent).toBe(CONSENT_DECLINE_NOTE + CONSENT_CONTACT_EMAIL);
    expect(button.compareDocumentPosition(recordNote!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recordNote!.compareDocumentPosition(noMarketingNote!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(noMarketingNote!.compareDocumentPosition(declineNote!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: CONSENT_CONTACT_EMAIL })).toHaveAttribute('href', `mailto:${CONSENT_CONTACT_EMAIL}`);
    expect(CONSENT_BUTTON_LABEL).toBe('同意して、コードを送る');
    expect(screen.getByRole('button', { name: '同意して、コードを送る' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'コードを送る' })).not.toBeInTheDocument();
  });

  it('pressing the button sends the email WITH the consent text version, and only then moves to the code step', async () => {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/auth/request')) {
        requests.push({ url, body: JSON.parse(String(init?.body)) });
        return jsonResponse({ ok: true });
      }
      return NOT_SIGNED_IN();
    }));
    const { LoginPage } = await import('../src/parent/login/LoginPage');
    const user = userEvent.setup();
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument());
    expect(requests).toHaveLength(0); // nothing is sent just by opening the page
    await user.type(screen.getByLabelText('メールアドレス'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: '同意して、コードを送る' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.body).toEqual({ email: 'parent@example.com', consentTextVersion: CONSENT_TEXT_VERSION });
  });

  it('?reconsent=1: a signed-in family WITHOUT recorded consent sees the form instead of being bounced onward', async () => {
    vi.resetModules();
    stubLocation('?reconsent=1&next=%2Faccount%2F%3Fbuy%3D1');
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: false, consentRecorded: false,
    })));
    const { LoginPage } = await import('../src/parent/login/LoginPage');
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument());
    expect(window.location.href).toBe('');
  });

  it('?reconsent=1 with consent ALREADY recorded still bounces straight to `next` (no needless form)', async () => {
    vi.resetModules();
    stubLocation('?reconsent=1&next=%2Faccount%2F%3Fbuy%3D1');
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: false, consentRecorded: true,
    })));
    const { LoginPage } = await import('../src/parent/login/LoginPage');
    render(<LoginPage />);

    await waitFor(() => expect(window.location.href).toBe('/account/?buy=1'));
  });
});

describe('landing buy button — login first, then Shopify with the purchase token', () => {
  async function clickLandingBuy(me: Response | (() => Response)) {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return typeof me === 'function' ? me() : me;
      return new Response('not found', { status: 404 });
    }));
    const { LandingPage } = await import('../src/lp/LandingPage');
    const user = userEvent.setup();
    render(<LandingPage />);
    const buy = screen.getAllByRole('button').find((b) => /購入|ひらく|はじめ|申し込/.test(b.textContent ?? ''));
    expect(buy).toBeDefined();
    await user.click(buy!);
  }

  it('signed out: goes to /login/ with next=/account/?buy=1', async () => {
    await clickLandingBuy(NOT_SIGNED_IN());
    await waitFor(() => expect(window.location.href).toBe('/login/?next=%2Faccount%2F%3Fbuy%3D1'));
  });

  it('signed in but no recorded consent: goes through /login/?reconsent=1 first', async () => {
    await clickLandingBuy(jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], consentRecorded: false }));
    await waitFor(() => expect(window.location.href).toBe('/login/?reconsent=1&next=%2Faccount%2F%3Fbuy%3D1'));
  });

  it('Notice D (item 5): shown above both buy buttons, linking to the privacy page, with the refund-for-declined-consent promise', async () => {
    vi.resetModules();
    stubLocation();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async () => NOT_SIGNED_IN()));
    const { LandingPage } = await import('../src/lp/LandingPage');
    render(<LandingPage />);

    const notices = document.querySelectorAll('.lp__notice-d');
    expect(notices.length).toBeGreaterThanOrEqual(2); // hero CTA + price-section CTA
    for (const notice of Array.from(notices)) {
      expect(notice.textContent).toContain('保護者の方のメールアドレスでのログインが必要です');
      expect(notice.textContent).toContain('全額返金いたします');
      const link = notice.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.getAttribute('href')).toBe('/legal/privacy/');
    }
  });
});

describe('/account/?buy=1 — straight on to Shopify with the purchase token, once', () => {
  const SHOPIFY = 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=tok123';

  async function openAccount(me: unknown) {
    vi.resetModules();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '', search: '?buy=1', pathname: '/account/' },
      writable: true,
    });
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (url.endsWith('/me')) return jsonResponse(me);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      if (url.endsWith('/purchase-intents')) return jsonResponse({ url: SHOPIFY, expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      return new Response('not found', { status: 404 });
    }));
    // No user gesture here, so a real browser may block the pre-opened tab: usePurchaseFlow falls
    // back to a same-tab redirect, which is what we assert.
    vi.stubGlobal('open', vi.fn(() => null));
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
    const { AccountPage } = await import('../src/parent/account/AccountPage');
    render(<AccountPage />);
    return calls;
  }

  it('an unentitled, consented family is sent to the Shopify URL with the purchase token — no extra click', async () => {
    const calls = await openAccount({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], consentRecorded: true });
    await waitFor(() => expect(window.location.href).toBe(SHOPIFY));
    expect(calls.filter((u) => u.endsWith('/purchase-intents'))).toHaveLength(1);
  });

  it('an already-entitled family (e.g. a waiting order was just bound at login) is NOT sent to checkout', async () => {
    const calls = await openAccount({
      familyId: 'f1', email: 'p***@example.com', consentRecorded: true, profiles: [], trials: [],
      entitlements: [{ moduleId: 'm1', status: 'active', grantedAt: '2026-09-20T03:00:00.000Z' }],
    });
    await waitFor(() => expect(calls.some((u) => u.endsWith('/me'))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((u) => u.endsWith('/purchase-intents'))).toHaveLength(0);
    expect(window.location.href).toBe('');
  });

  it('a family with no recorded consent is NOT sent to checkout', async () => {
    const calls = await openAccount({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], consentRecorded: false });
    await waitFor(() => expect(calls.some((u) => u.endsWith('/me'))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((u) => u.endsWith('/purchase-intents'))).toHaveLength(0);
  });

  it('Notice D (item 5): shown above 「購入手続きへ進む」, linking to the privacy page', async () => {
    await openAccount({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], consentRecorded: false });
    const button = await screen.findByRole('button', { name: '購入手続きへ進む' });
    const notice = document.querySelector('.account__notice-d');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('保護者の方のメールアドレスでのログインが必要です');
    expect(notice?.textContent).toContain('全額返金いたします');
    expect(notice?.querySelector('a')?.getAttribute('href')).toBe('/legal/privacy/');
    expect(notice!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('/account — a family without recorded consent is sent to agree before a code is requested', () => {
  it('requesting the account-deletion code sends them to /login/?reconsent=1 and requests nothing', async () => {
    vi.resetModules();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '', search: '', pathname: '/account/' }, writable: true });
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (url.endsWith('/me')) return jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], consentRecorded: false });
      if (url.endsWith('/sessions')) return jsonResponse([]);
      return new Response('not found', { status: 404 });
    }));
    const { AccountPage } = await import('../src/parent/account/AccountPage');
    const user = userEvent.setup();
    render(<AccountPage />);
    const button = await screen.findByRole('button', { name: '削除用のコードを送る' });
    await user.click(button);
    await waitFor(() => expect(window.location.href).toBe('/login/?reconsent=1&next=%2Faccount%2F'));
    expect(calls.some((u) => u.endsWith('/auth/request'))).toBe(false);
  });
});

describe('account deletion code — bug fix (1 Oct 2026): never sends the MASKED /me email to the public login-code endpoint', () => {
  it('a consenting family tapping 「削除用のコードを送る」 calls the dedicated /account/delete-code endpoint, never /auth/request', async () => {
    vi.resetModules();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '', search: '', pathname: '/account/' }, writable: true });
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/me')) return jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], consentRecorded: true });
      if (url.endsWith('/sessions')) return jsonResponse([]);
      if (url.endsWith('/account/delete-code')) return jsonResponse({});
      return new Response('not found', { status: 404 });
    }));
    const { AccountPage } = await import('../src/parent/account/AccountPage');
    const user = userEvent.setup();
    render(<AccountPage />);
    const button = await screen.findByRole('button', { name: '削除用のコードを送る' });
    await user.click(button);

    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/account/delete-code'))).toBe(true));
    expect(calls.some((c) => c.url.endsWith('/auth/request'))).toBe(false);
    // Nothing identifying the family travels in this call — the backend reads it from the session.
    const deleteCodeCall = calls.find((c) => c.url.endsWith('/account/delete-code'))!;
    expect(deleteCodeCall.body).not.toEqual(expect.objectContaining({ email: expect.anything() }));
    expect(await screen.findByPlaceholderText('123456')).toBeInTheDocument(); // the confirm-code step opened
  });
});
