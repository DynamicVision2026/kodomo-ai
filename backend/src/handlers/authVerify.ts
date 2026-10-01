import { sendEmailWithConsent } from '../emailGate.js';
import type { Env } from '../types.js';
import { verifyLoginCode } from '../loginCode.js';
import { createSession, serializeSessionCookie, SESSION_TTL_SECONDS } from '../session.js';
import { buildMeResponse, deviceLabelFromUserAgent } from '../me.js';
import { getFamily } from '../family.js';
import { bindUnboundOrdersOnLogin } from '../bindOnLogin.js';
import { deviceEvictedEmail } from '../email.js';
import { passesCsrfCheck } from '../csrf.js';

/** POST /api/v1/auth/verify — AD-13 §3/§5 step 3, AD-15 "account-first": on a correct code,
 *  `verifyLoginCode` creates the family (if this is its first ever login) — AD-16 §0: login
 *  itself is NEVER gated by trial or entitlement state, only by whether the code itself was
 *  right (`invalid`/`expired`/`locked` are the only rejection outcomes now). On success: sets
 *  the session cookie, applies LRU eviction at the cap, returns the same body `/me` would. */
export async function handleAuthVerify(request: Request, env: Env): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });

  let body: { email?: unknown; code?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; code?: unknown };
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.email !== 'string' || typeof body.code !== 'string') {
    return new Response('email and code are required', { status: 400 });
  }

  const result = await verifyLoginCode(env, body.email, body.code);
  if (result.outcome !== 'ok' || !result.familyId) {
    return new Response(JSON.stringify({ error: result.outcome }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const label = deviceLabelFromUserAgent(request.headers.get('user-agent'));
  const created = await createSession(env, result.familyId, label);

  if (created.evicted) {
    const family = await getFamily(env, result.familyId);
    if (family) await sendEmailWithConsent(env, deviceEvictedEmail(family.email, label, created.evicted.session.label));
  }

  // Consent at login: a verified login binds any paid order still waiting on this email. Never
  // allowed to fail the login itself.
  try {
    await bindUnboundOrdersOnLogin(env, result.familyId, body.email);
  } catch (err) {
    console.error('[bind-on-login] failed', err);
  }

  const me = await buildMeResponse(env, result.familyId);
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', serializeSessionCookie(created.token, SESSION_TTL_SECONDS));
  return new Response(JSON.stringify(me), { status: 200, headers });
}
