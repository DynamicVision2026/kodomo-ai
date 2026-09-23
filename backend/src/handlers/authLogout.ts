import type { Env } from '../types.js';
import { resolveSession, revokeSession, serializeSessionCookieClear } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';

/** POST /api/v1/auth/logout — revokes the current session and clears the cookie. Always
 *  succeeds (204) even with no/invalid session: logging out of a session that's already gone is
 *  not an error from the client's point of view. */
export async function handleAuthLogout(request: Request, env: Env): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });

  const resolved = await resolveSession(env, request);
  if (resolved) await revokeSession(env, resolved.tokenHash);

  const headers = new Headers();
  headers.append('set-cookie', serializeSessionCookieClear());
  return new Response(null, { status: 204, headers });
}
