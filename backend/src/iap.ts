/**
 * AD-16 §8: verifies the `x-goog-iap-jwt-assertion` header Google Identity-Aware Proxy attaches
 * to every request once IAP is enabled in front of `kodomo-ai-admin` — this is the ONLY staff
 * authentication path (never email OTP: AD-16 is explicit that staff never use the family login
 * flow). Real ES256/JWK verification via Web Crypto, not a stub: decodes the JWT, fetches
 * Google's own current signing keys, verifies the signature, issuer, audience and expiry, and
 * returns the verified `email` claim.
 *
 * The Google Sign-In fallback AD-16 §8 allows ("if IAP cannot be enabled on this setup") is NOT
 * implemented here — it needs a different token shape (RS256, a different JWKS endpoint,
 * `https://www.googleapis.com/oauth2/v3/certs`) and is explicitly secondary to IAP. Flagged as a
 * follow-up rather than half-built alongside this.
 */

const IAP_JWKS_URL = 'https://www.gstatic.com/iap/verify/public_key-jwk';
const IAP_ISSUER = 'https://cloud.google.com/iap';

interface Jwk {
  kid: string;
  kty: string;
  crv: string;
  x: string;
  y: string;
}

let cachedKeys: Map<string, Jwk> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchKeys(): Promise<Map<string, Jwk>> {
  if (cachedKeys && Date.now() - cachedAt < CACHE_TTL_MS) return cachedKeys;
  const res = await fetch(IAP_JWKS_URL);
  if (!res.ok) throw new Error(`could not fetch IAP public keys: ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  cachedKeys = new Map(body.keys.map((k) => [k.kid, k]));
  cachedAt = Date.now();
  return cachedKeys;
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64UrlDecodeJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(input))) as T;
}

export interface VerifiedIapIdentity {
  email: string;
}

/**
 * `expectedAudience` is IAP's own resource audience, e.g.
 * `/projects/123456789/apps/kodomo-ai-admin` — set via `IAP_AUDIENCE` (an external-config item;
 * see AD-16 §12, "enable IAP for kodomo-ai-admin"). Returns `null` for anything that doesn't
 * verify — an invalid signature, wrong issuer/audience, or an expired token — never throws for a
 * malformed token (callers should treat `null` as "unauthenticated", not crash the request).
 */
export async function verifyIapJwt(jwt: string, expectedAudience: string): Promise<VerifiedIapIdentity | null> {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = base64UrlDecodeJson<{ alg: string; kid: string }>(headerPart);
    if (header.alg !== 'ES256') return null;

    const keys = await fetchKeys();
    const jwk = keys.get(header.kid);
    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const signedData = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const signature = base64UrlDecode(signaturePart);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature as unknown as ArrayBuffer,
      signedData as unknown as ArrayBuffer,
    );
    if (!valid) return null;

    const payload = base64UrlDecodeJson<{ iss: string; aud: string; exp: number; email?: string }>(payloadPart);
    if (payload.iss !== IAP_ISSUER) return null;
    if (payload.aud !== expectedAudience) {
      // Deliberately logs ONLY the received aud, never the rest of the token (email, issuer,
      // expiry) — this exists so a misconfigured IAP_AUDIENCE can be corrected from the real
      // value Cloud Run received, without guessing the exact resource-audience format IAP uses
      // for a direct Cloud Run integration (it differs from App Engine's/a backend service's).
      console.log(`[iap] audience mismatch: received aud="${payload.aud}"`);
      return null;
    }
    if (payload.exp * 1000 <= Date.now()) return null;
    if (!payload.email) return null;

    return { email: payload.email.trim().toLowerCase() };
  } catch {
    return null;
  }
}
