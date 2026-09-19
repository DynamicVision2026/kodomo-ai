import { describe, it, expect, vi, afterEach } from 'vitest';
import { redeemFamilyCode } from '../src/parent/unlock/redeemCode';

afterEach(() => vi.unstubAllGlobals());

describe('redeemFamilyCode', () => {
  it('reports not_configured without ever attempting a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await redeemFamilyCode(undefined, 'NAZE-ABCD-EFGH', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the code and deviceId to <apiBaseUrl>/unlock', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ moduleIds: ['m1'], founder: false, overCap: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await redeemFamilyCode('https://worker.example', 'NAZE-ABCD-EFGH', 'device-1');
    expect(result).toEqual({ ok: true, moduleIds: ['m1'], founder: false, overCap: false });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://worker.example/unlock');
    expect(JSON.parse(init.body)).toEqual({ code: 'NAZE-ABCD-EFGH', deviceId: 'device-1' });
  });

  it('maps a 404 to not_found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await redeemFamilyCode('https://worker.example', 'NAZE-ZZZZ-ZZZZ', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('maps any other non-ok status to server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await redeemFamilyCode('https://worker.example', 'NAZE-ABCD-EFGH', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'server' });
  });

  it('maps a thrown fetch (offline, DNS failure, etc.) to network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await redeemFamilyCode('https://worker.example', 'NAZE-ABCD-EFGH', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('maps an unparseable success body to server rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }));
    const result = await redeemFamilyCode('https://worker.example', 'NAZE-ABCD-EFGH', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'server' });
  });
});
