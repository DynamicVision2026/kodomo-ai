import type { Env } from './types.js';
import type { RateLimitDoc } from './schema.js';
import { rateLimitPath } from './schema.js';
import { sha256Hex } from './util.js';

/** AD-13 §4: "20 requests per IP per hour" on `/auth/request`. Not transactional — a small race
 *  under real concurrent abuse can let a couple of extra requests through, which is an acceptable
 *  trade for "minimum release-critical" (this is abuse mitigation, not the security boundary
 *  itself — the OTP's own attempt cap and constant-time compare are). */
const IP_HOURLY_LIMIT = 20;

function hourBucket(now: Date): string {
  return now.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
}

/** Increments and checks the per-IP hourly counter; returns false once the cap is reached
 *  (the request that tips it over is itself refused, not counted as one more freebie). */
export async function checkIpRateLimit(env: Env, ip: string): Promise<boolean> {
  const ipHash = await sha256Hex(ip);
  const now = new Date();
  const path = rateLimitPath(ipHash, hourBucket(now));
  const existing = await env.db.get<RateLimitDoc>(path);
  if (existing && existing.count >= IP_HOURLY_LIMIT) return false;
  const next: RateLimitDoc = {
    count: (existing?.count ?? 0) + 1,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  };
  await env.db.set(path, next);
  return true;
}
