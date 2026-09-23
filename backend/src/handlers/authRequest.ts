import type { Env } from '../types.js';
import { requestLoginCode } from '../loginCode.js';
import { checkIpRateLimit } from '../rateLimit.js';
import { passesCsrfCheck } from '../csrf.js';

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function genericOk(): Response {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** POST /api/v1/auth/request — AD-13 §3/§4, AD-15 "account-first": always the same response,
 *  whether the email already has a family, is brand new, or is even rate-limited — no
 *  enumeration, ever (see loginCode.ts). */
export async function handleAuthRequest(request: Request, env: Env): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });

  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.email !== 'string' || !body.email.trim()) {
    return new Response('email is required', { status: 400 });
  }

  const ipOk = await checkIpRateLimit(env, clientIp(request));
  if (ipOk) {
    await requestLoginCode(env, body.email);
  }
  return genericOk();
}
