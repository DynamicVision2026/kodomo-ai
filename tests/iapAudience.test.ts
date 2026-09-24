/** @vitest-environment node */
/**
 * AD-16 §8: unlike ad16AdminDashboard.test.ts (which mocks verifyIapJwt entirely to test the
 * authorization logic behind it), this file exercises the REAL ES256/JWK verification in
 * backend/src/iap.ts directly — the email-normalization behavior the staff/{email} allowlist
 * lookup relies on, and the audience-mismatch log line staff use to read the real `aud` Cloud
 * Run's IAP integration sends (see docs/launch-runbook.md Part 2B), without guessing its format.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { verifyIapJwt } from '../backend/src/iap';

const ISSUER = 'https://cloud.google.com/iap';
const AUDIENCE = '/projects/123456789/locations/asia-northeast1/services/kodomo-ai-admin';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeSigningKey(): Promise<{ privateKey: CryptoKey; jwk: { kid: string; kty: string; crv: string; x: string; y: string } }> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey) as JsonWebKey;
  return {
    privateKey: keyPair.privateKey,
    jwk: { kid: 'test-key-1', kty: publicJwk.kty!, crv: publicJwk.crv!, x: publicJwk.x!, y: publicJwk.y! },
  };
}

async function signJwt(privateKey: CryptoKey, kid: string, payload: Record<string, unknown>): Promise<string> {
  const headerPart = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid })));
  const payloadPart = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

describe('iap.ts — verifyIapJwt: email normalization and audience-mismatch logging', () => {
  let privateKey: CryptoKey;
  let jwk: { kid: string; kty: string; crv: string; x: string; y: string };

  // verifyIapJwt caches the fetched JWKS for an hour (it mirrors real IAP key rotation, where
  // re-fetching on every request would be wasteful) — so all tests in this file share ONE key
  // pair, generated once, rather than each minting its own and hitting a stale cached key.
  beforeAll(async () => {
    const keys = await makeSigningKey();
    privateKey = keys.privateKey;
    jwk = keys.jwk;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lowercases and trims the verified email claim — the staff/{email} allowlist lookup depends on this', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = await signJwt(privateKey, jwk.kid, { iss: ISSUER, aud: AUDIENCE, exp, email: '  Operator@Example.COM  ' });
    const identity = await verifyIapJwt(jwt, AUDIENCE);
    expect(identity).toEqual({ email: 'operator@example.com' });
  });

  it('a matching audience verifies successfully', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = await signJwt(privateKey, jwk.kid, { iss: ISSUER, aud: AUDIENCE, exp, email: 'operator@example.com' });
    const identity = await verifyIapJwt(jwt, AUDIENCE);
    expect(identity).toEqual({ email: 'operator@example.com' });
  });

  it('an audience mismatch is refused and logs ONLY the received aud — never the email, issuer, or expiry', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const wrongAud = '/projects/123456789/apps/kodomo-ai-admin'; // e.g. the App Engine format, misconfigured
    const jwt = await signJwt(privateKey, jwk.kid, { iss: ISSUER, aud: wrongAud, exp, email: 'operator@example.com' });

    const identity = await verifyIapJwt(jwt, AUDIENCE);
    expect(identity).toBeNull();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = String(logSpy.mock.calls[0]![0]);
    expect(logged).toContain(wrongAud);
    expect(logged).not.toContain('operator@example.com');
    expect(logged).not.toContain(ISSUER);
    expect(logged).not.toContain(String(exp));
  });

  it('a correct audience never logs anything', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = await signJwt(privateKey, jwk.kid, { iss: ISSUER, aud: AUDIENCE, exp, email: 'operator@example.com' });
    await verifyIapJwt(jwt, AUDIENCE);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
