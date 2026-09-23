import type { Env } from '../types.js';
import { resolveSession, serializeSessionCookie, SESSION_TTL_SECONDS } from '../session.js';
import { buildMeResponse } from '../me.js';

/** GET /api/v1/me — AD-13 §5 step 4: "the cookie is valid -> straight to the profile picker."
 *  Re-issues the session cookie on every call (fresh Max-Age) so the browser-held cookie
 *  actually slides forward the way AD-13 §1's "1-year sliding expiry" describes — the
 *  Firestore-side `lastSeenAt`/`expiresAt` write itself stays throttled to once a day
 *  (session.ts), this is just the (free) client-visible half of the same behaviour. */
export async function handleMe(request: Request, env: Env): Promise<Response> {
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });

  const me = await buildMeResponse(env, resolved.session.familyId);
  if (!me) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });

  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', serializeSessionCookie(resolved.token, SESSION_TTL_SECONDS));
  return new Response(JSON.stringify(me), { status: 200, headers });
}
