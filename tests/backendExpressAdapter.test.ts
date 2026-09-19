/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { toFetchRequest, sendFetchResponse } from '../backend/server/expressAdapter';

function fakeExpressRequest(overrides: Record<string, unknown> = {}) {
  return {
    protocol: 'https',
    method: 'POST',
    originalUrl: '/webhooks/shopify/orders-paid',
    headers: { 'x-shopify-hmac-sha256': 'abc123', 'content-type': 'application/json' },
    body: Buffer.from('{"id":1}'),
    get(name: string) {
      return name.toLowerCase() === 'host' ? 'backend.example' : undefined;
    },
    ...overrides,
  } as unknown as Parameters<typeof toFetchRequest>[0];
}

describe('toFetchRequest', () => {
  it('builds a Request with the exact raw body bytes (critical for HMAC verification)', async () => {
    const req = fakeExpressRequest({ body: Buffer.from('{"id":42,"line_items":[]}') });
    const fetchReq = toFetchRequest(req);
    expect(await fetchReq.text()).toBe('{"id":42,"line_items":[]}');
  });

  it('carries the URL and method through', () => {
    const req = fakeExpressRequest({ method: 'POST', originalUrl: '/admin/issue' });
    const fetchReq = toFetchRequest(req);
    expect(fetchReq.url).toBe('https://backend.example/admin/issue');
    expect(fetchReq.method).toBe('POST');
  });

  it('preserves headers, including the Shopify HMAC signature header', () => {
    const req = fakeExpressRequest({ headers: { 'x-shopify-hmac-sha256': 'the-signature' } });
    const fetchReq = toFetchRequest(req);
    expect(fetchReq.headers.get('x-shopify-hmac-sha256')).toBe('the-signature');
  });

  it('joins a duplicated header (array form) with a comma, not just the first value', () => {
    const req = fakeExpressRequest({ headers: { 'x-forwarded-for': ['1.2.3.4', '5.6.7.8'] } });
    const fetchReq = toFetchRequest(req);
    expect(fetchReq.headers.get('x-forwarded-for')).toBe('1.2.3.4, 5.6.7.8');
  });

  it('never attaches a body to a GET request (the Fetch spec forbids it)', () => {
    const req = fakeExpressRequest({ method: 'GET', body: Buffer.from('') });
    expect(() => toFetchRequest(req)).not.toThrow();
    expect(toFetchRequest(req).body).toBeNull();
  });

  it('leaves the body undefined for an empty buffer rather than sending zero bytes', () => {
    const req = fakeExpressRequest({ method: 'POST', body: Buffer.alloc(0) });
    expect(toFetchRequest(req).body).toBeNull();
  });
});

describe('sendFetchResponse', () => {
  function fakeExpressResponse() {
    const headers: Record<string, string> = {};
    return {
      statusCode: 0,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader: vi.fn((key: string, value: string) => {
        headers[key] = value;
      }),
      send: vi.fn(),
      _headers: headers,
    };
  }

  it('copies status code and body from the Fetch Response', async () => {
    const res = fakeExpressResponse();
    const fetchRes = new Response('hello', { status: 201 });
    await sendFetchResponse(res as never, fetchRes);
    expect(res.statusCode).toBe(201);
    expect(res.send).toHaveBeenCalledWith('hello');
  });

  it('forwards headers but skips content-length/transfer-encoding (Node manages those itself)', async () => {
    const res = fakeExpressResponse();
    const fetchRes = new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-length': '11' },
    });
    await sendFetchResponse(res as never, fetchRes);
    expect(res._headers['content-type']).toBe('application/json');
    expect(res._headers['content-length']).toBeUndefined();
  });
});
