import type { Env } from '../types.js';
import { listActiveSessions, resolveSession, revokeSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { sessionPath, type SessionDoc } from '../schema.js';

/** GET /api/v1/sessions — the account page's device list. */
export async function handleListSessions(request: Request, env: Env): Promise<Response> {
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  const sessions = await listActiveSessions(env, resolved.session.familyId);
  const body = sessions.map((s) => ({
    id: s.id,
    label: s.data.label,
    createdAt: s.data.createdAt,
    lastSeenAt: s.data.lastSeenAt,
    isCurrent: s.id === resolved.tokenHash,
  }));
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** DELETE /api/v1/sessions/{id} — a parent signing a specific device out from the account page.
 *  Scoped to the caller's own family: a session id belonging to a different family 404s exactly
 *  like one that doesn't exist, never revealing which. */
export async function handleDeleteSession(request: Request, env: Env, sessionId: string): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });

  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  const target = await env.db.get<SessionDoc>(sessionPath(sessionId));
  if (!target || target.familyId !== resolved.session.familyId) return new Response('not found', { status: 404 });

  await revokeSession(env, sessionId);
  return new Response(null, { status: 204 });
}
