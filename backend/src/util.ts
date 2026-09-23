/** Fixed-time string comparison — used for both the Shopify webhook signature and the admin
 *  bearer token, so neither leaks how many leading characters matched via response timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** AD-13 §2: every hashed/looked-up email (`emailIndex/{sha256(email)}`, `loginCodes/{sha256
 *  (email)}`) and session token (`sessions/{sha256(token)}`) goes through this — plain SHA-256,
 *  no secret needed since the goal here is a deterministic lookup key, not tamper-resistance
 *  (that's what AUTH_PEPPER-keyed HMACs below are for). Email is lowercased first so the same
 *  address always hashes to the same index doc regardless of how it was typed/cased. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(digest);
}

/** AD-13 §2/§4: `loginCodes.codeHmac` and `sessions`' stored token are never the raw
 *  secret — only an HMAC keyed by `AUTH_PEPPER`, so a Firestore read (or backup, or export) never
 *  hands out something directly usable as a login code or session credential. */
export async function hmacHex(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return toHex(digest);
}

/** Opaque session token / import id source — 256 bits of `crypto.getRandomValues` randomness,
 *  hex-encoded. Never derived from anything guessable (time, counters, email). */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

/** AD-13 §4: "6 digits from a cryptographic random generator." Per-digit `getRandomValues` avoids
 *  the modulo bias a single `Math.random() * 1e6` would carry, and never touches `Math.random`
 *  (not cryptographically secure) at all. */
export function randomOtp(): string {
  const digits = new Uint32Array(6);
  crypto.getRandomValues(digits);
  return Array.from(digits, (d) => (d % 10).toString()).join('');
}
