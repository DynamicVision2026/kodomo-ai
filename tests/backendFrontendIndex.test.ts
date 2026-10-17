/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// CANONICAL_HOST/BACKEND_URL are read once at module load time, so each describe block that
// needs a different value re-imports the module fresh (vi.resetModules + dynamic import) —
// the same pattern tests/LandingPage.test.tsx already uses for its own load-time env var.

function fakeReq(overrides: Record<string, unknown> = {}) {
  return {
    hostname: 'kodomo-ai-421702481956.asia-northeast1.run.app',
    originalUrl: '/play/?x=1',
    method: 'GET',
    headers: {},
    body: Buffer.alloc(0),
    ...overrides,
  } as any;
}

function fakeRes() {
  const headers: Record<string, string> = {};
  const appended: Array<[string, string]> = [];
  return {
    statusCode: 0,
    redirected: null as { code: number; url: string } | null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    redirect(code: number, url: string) {
      this.redirected = { code, url };
    },
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    append: vi.fn((key: string, value: string) => {
      appended.push([key, value]);
    }),
    send: vi.fn(),
    _headers: headers,
    _appended: appended,
  } as any;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('isRevisionTagHost', () => {
  it('recognizes a Cloud Run revision-tag host by its reserved --- delimiter', async () => {
    const { isRevisionTagHost } = await import('../backend/server/frontendIndex');
    expect(isRevisionTagHost('candidate-124---kodomo-ai-2igizbslpa-an.a.run.app')).toBe(true);
    expect(isRevisionTagHost('kodomo-ai-421702481956.asia-northeast1.run.app')).toBe(false);
  });
});

describe('canonicalRedirect', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('is a no-op when CANONICAL_HOST is not configured (local dev/test)', async () => {
    vi.stubEnv('CANONICAL_HOST', '');
    const { canonicalRedirect } = await import('../backend/server/frontendIndex');
    const req = fakeReq({ hostname: 'anything.example' });
    const res = fakeRes();
    const next = vi.fn();
    canonicalRedirect(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.redirected).toBeNull();
  });

  it('passes through when the Host already matches the canonical host', async () => {
    vi.stubEnv('CANONICAL_HOST', 'kodomo-ai-421702481956.asia-northeast1.run.app');
    const { canonicalRedirect } = await import('../backend/server/frontendIndex');
    const req = fakeReq({ hostname: 'kodomo-ai-421702481956.asia-northeast1.run.app' });
    const res = fakeRes();
    const next = vi.fn();
    canonicalRedirect(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.redirected).toBeNull();
  });

  it('301-redirects the OTHER default Cloud Run hostname to the canonical one, preserving path and query', async () => {
    vi.stubEnv('CANONICAL_HOST', 'kodomo-ai-421702481956.asia-northeast1.run.app');
    const { canonicalRedirect } = await import('../backend/server/frontendIndex');
    const req = fakeReq({ hostname: 'kodomo-ai-2igizbslpa-an.a.run.app', originalUrl: '/play/?next=/m1' });
    const res = fakeRes();
    const next = vi.fn();
    canonicalRedirect(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.redirected).toEqual({
      code: 301,
      url: 'https://kodomo-ai-421702481956.asia-northeast1.run.app/play/?next=/m1',
    });
  });

  it('exempts a Cloud Run revision-tag host (CI\'s own pre-promotion smoke test) from the redirect', async () => {
    vi.stubEnv('CANONICAL_HOST', 'kodomo-ai-421702481956.asia-northeast1.run.app');
    const { canonicalRedirect } = await import('../backend/server/frontendIndex');
    const req = fakeReq({ hostname: 'candidate-124---kodomo-ai-2igizbslpa-an.a.run.app' });
    const res = fakeRes();
    const next = vi.fn();
    canonicalRedirect(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.redirected).toBeNull();
  });
});

describe('proxyToBackend', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('answers 503 when BACKEND_URL is not configured', async () => {
    vi.stubEnv('BACKEND_URL', '');
    const { proxyToBackend } = await import('../backend/server/frontendIndex');
    const res = fakeRes();
    await proxyToBackend(fakeReq(), res);
    expect(res.statusCode).toBe(503);
  });

  it('forwards method/path/headers (dropping Host) to the backend and streams back status + body', async () => {
    vi.stubEnv('BACKEND_URL', 'https://kodomo-ai-backend-xyz.a.run.app');
    const fetchMock: ReturnType<typeof vi.fn<typeof fetch>> = vi.fn(
      async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { proxyToBackend } = await import('../backend/server/frontendIndex');

    const req = fakeReq({
      method: 'GET',
      originalUrl: '/api/v1/me',
      headers: { host: 'kodomo-ai-421702481956.asia-northeast1.run.app', cookie: '__Host-nz_session=abc' },
    });
    const res = fakeRes();
    await proxyToBackend(req, res);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0]!;
    expect(target).toBe('https://kodomo-ai-backend-xyz.a.run.app/api/v1/me');
    expect((init!.headers as Headers).get('host')).toBeNull();
    expect((init!.headers as Headers).get('cookie')).toBe('__Host-nz_session=abc');
    expect(res.statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('application/json');
  });

  it("passes the backend's Set-Cookie (the __Host-nz_session session cookie) through byte-for-byte via res.append", async () => {
    vi.stubEnv('BACKEND_URL', 'https://kodomo-ai-backend-xyz.a.run.app');
    const cookie = '__Host-nz_session=newvalue; Path=/; Secure; HttpOnly; SameSite=Lax';
    const fetchMock: ReturnType<typeof vi.fn<typeof fetch>> = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'set-cookie': cookie } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { proxyToBackend } = await import('../backend/server/frontendIndex');

    const req = fakeReq({ method: 'POST', originalUrl: '/api/v1/auth/verify', body: Buffer.from('{}') });
    const res = fakeRes();
    await proxyToBackend(req, res);

    expect(res._appended).toContainEqual(['set-cookie', cookie]);
    expect(res._headers['set-cookie']).toBeUndefined(); // never double-set via setHeader too
  });

  it('sends the raw request body through unmodified for a non-GET/HEAD request', async () => {
    vi.stubEnv('BACKEND_URL', 'https://kodomo-ai-backend-xyz.a.run.app');
    const fetchMock: ReturnType<typeof vi.fn<typeof fetch>> = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { proxyToBackend } = await import('../backend/server/frontendIndex');

    const req = fakeReq({ method: 'POST', originalUrl: '/api/v1/auth/request', body: Buffer.from('{"email":"a@b.com"}') });
    const res = fakeRes();
    await proxyToBackend(req, res);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(Buffer.from(init!.body as Buffer).toString()).toBe('{"email":"a@b.com"}');
  });

  it('answers 502 when the backend is unreachable, rather than crashing the proxy', async () => {
    vi.stubEnv('BACKEND_URL', 'https://kodomo-ai-backend-xyz.a.run.app');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const { proxyToBackend } = await import('../backend/server/frontendIndex');

    const res = fakeRes();
    await proxyToBackend(fakeReq(), res);
    expect(res.statusCode).toBe(502);
  });
});

describe('legacyRootRedirect (WO-D1: ナゼホリ moved from / to /nazehori/)', () => {
  it('302-redirects "/" with ?email= to /nazehori/, keeping the query', async () => {
    const { legacyRootRedirect } = await import('../backend/server/frontendIndex');
    const res = fakeRes();
    const next = vi.fn();
    legacyRootRedirect(fakeReq({ originalUrl: '/?email=a%40b.jp&order=1001' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.redirected).toEqual({ code: 302, url: '/nazehori/?email=a%40b.jp&order=1001' });
  });

  it('serves the cover page for a plain "/" or unrelated query', async () => {
    const { legacyRootRedirect } = await import('../backend/server/frontendIndex');
    for (const originalUrl of ['/', '/?utm_source=x']) {
      const res = fakeRes();
      const next = vi.fn();
      legacyRootRedirect(fakeReq({ originalUrl }), res, next);
      expect(next).toHaveBeenCalled();
      expect(res.redirected).toBeNull();
    }
  });
});
