import type { Env } from './types.js';
import type { SessionDoc } from './schema.js';
import { MAX_ACTIVE_SESSIONS, sessionPath, sessionsCollection } from './schema.js';
import { hmacHex, randomToken } from './util.js';

/** AD-13 §1: `__Host-` requires Secure + Path=/ + no Domain attribute — the browser itself
 *  refuses to set it any other way, which is exactly the first-party guarantee the spec's own
 *  "cookies must be first-party" domain requirement needs. */
export const SESSION_COOKIE_NAME = '__Host-nz_session';
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year, sliding
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000; // "written at most once a day" (AD-13 §2)

function tokenHashOf(env: Env, token: string): Promise<string> {
  return hmacHex(token, env.AUTH_PEPPER);
}

export function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function serializeSessionCookieClear(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) return rest.join('=');
  }
  return null;
}

export interface CreatedSession {
  token: string;
  tokenHash: string;
  session: SessionDoc;
  /** The session this login evicted to stay at the AD-13 §1 cap of 5 — present only when an
   *  eviction actually happened, so the caller can send the "new device signed in / older one
   *  signed out" notice (AD-13 §4). */
  evicted?: { id: string; session: SessionDoc };
}

/** AD-13 §1/§5: creates the new session first, then evicts the least-recently-used ACTIVE
 *  session if that pushes the family over the cap — "a 6th login automatically signs out the
 *  least-recently-used session," never a denial of the new login itself. */
export async function createSession(env: Env, familyId: string, label: string): Promise<CreatedSession> {
  const token = randomToken(32);
  const tokenHash = await tokenHashOf(env, token);
  const now = new Date();
  const session: SessionDoc = {
    familyId,
    label,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    revokedAt: null,
  };
  await env.db.set(sessionPath(tokenHash), session);

  const active = await listActiveSessions(env, familyId);
  let evicted: CreatedSession['evicted'];
  if (active.length > MAX_ACTIVE_SESSIONS) {
    const lru = active.reduce((a, b) => (a.data.lastSeenAt <= b.data.lastSeenAt ? a : b));
    await env.db.set(sessionPath(lru.id), { ...lru.data, revokedAt: now.toISOString() });
    evicted = { id: lru.id, session: lru.data };
  }

  return { token, tokenHash, session, evicted };
}

export interface ResolvedSession {
  token: string;
  tokenHash: string;
  session: SessionDoc;
}

/** Validates a session token from a request's cookie: exists, not revoked, not expired. Touches
 *  `lastSeenAt`/`expiresAt` (sliding TTL) at most once per `TOUCH_INTERVAL_MS`, never on every
 *  request (AD-13 §2: "`lastSeenAt` is written at most once a day"). */
export async function resolveSession(env: Env, request: Request): Promise<ResolvedSession | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const tokenHash = await tokenHashOf(env, token);
  const session = await env.db.get<SessionDoc>(sessionPath(tokenHash));
  if (!session || session.revokedAt) return null;
  const now = Date.now();
  if (new Date(session.expiresAt).getTime() <= now) return null;

  if (now - new Date(session.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
    const touched: SessionDoc = {
      ...session,
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    };
    await env.db.set(sessionPath(tokenHash), touched);
    return { token, tokenHash, session: touched };
  }
  return { token, tokenHash, session };
}

export async function revokeSession(env: Env, tokenHash: string): Promise<void> {
  const session = await env.db.get<SessionDoc>(sessionPath(tokenHash));
  if (!session || session.revokedAt) return;
  await env.db.set(sessionPath(tokenHash), { ...session, revokedAt: new Date().toISOString() });
}

/** Every non-revoked, non-expired session belonging to a family — the account page's device
 *  list (AD-13 §3 `GET /sessions`) and the LRU-eviction check both read this. */
export async function listActiveSessions(env: Env, familyId: string) {
  const all = await env.db.query<SessionDoc>(sessionsCollection(), 'familyId', familyId);
  const now = Date.now();
  return all.filter((doc) => !doc.data.revokedAt && new Date(doc.data.expiresAt).getTime() > now);
}
