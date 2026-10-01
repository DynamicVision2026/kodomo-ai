import { sendEmailWithConsent } from '../emailGate.js';
import type { Env } from '../types.js';
import type { EmailIndexDoc, EntitlementDoc, FamilyDoc, OrderDoc } from '../schema.js';
import { emailIndexPath, entitlementPath, familyPath, orderPath, sessionsCollection } from '../schema.js';
import { timingSafeEqual } from '../util.js';
import { emailHashOf, findFamilyIdByEmail, getFamily, normalizeEmail } from '../family.js';
import { moduleActivatedEmail } from '../email.js';
import { listActiveSessions, revokeSession } from '../session.js';
import { loginUrl } from '../links.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function checkAdminAuth(request: Request, env: Env): boolean {
  const auth = request.headers.get('authorization') ?? '';
  return timingSafeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`);
}

/**
 * Every `/admin/*` route AD-13 §3 lists, dispatched from a single Bearer-token check — support
 * tooling/founder use, never called from a browser (no CORS, no session cookie, no CSRF check
 * needed: the bearer token itself is the whole authorization boundary, same as the old
 * `/admin/issue`). AD-16 §8: this bearer-token surface is retained for CLI/script use only — the
 * real staff-facing admin dashboard is the separate `kodomo-ai-admin` IAP-protected deployment
 * (backend/src/adminRouter.ts + backend/server/adminIndex.ts), which never accepts `ADMIN_TOKEN`
 * and reuses the same domain functions this file also calls (family.ts, session.ts, refund.ts).
 */
export async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  if (!checkAdminAuth(request, env)) return new Response('unauthorized', { status: 401 });

  const segments = url.pathname.replace(/^\/admin\//, '').split('/').filter(Boolean);

  // GET /admin/family?email=...  or  ?orderId=...
  if (request.method === 'GET' && segments[0] === 'family') {
    const email = url.searchParams.get('email');
    const orderId = url.searchParams.get('orderId');
    let familyId: string | null = null;
    if (email) familyId = await findFamilyIdByEmail(env, await emailHashOf(email));
    else if (orderId) {
      const order = await env.db.get<OrderDoc>(orderPath(orderId));
      familyId = order?.familyId ?? null;
    } else {
      return new Response('email or orderId is required', { status: 400 });
    }
    if (!familyId) return new Response('not found', { status: 404 });
    const family = await getFamily(env, familyId);
    if (!family) return new Response('not found', { status: 404 });
    const entitlements = await env.db.list<EntitlementDoc>(`families/${familyId}/entitlements`);
    return jsonResponse({ familyId, family, entitlements: entitlements.map((e) => ({ moduleId: e.id, ...e.data })) });
  }

  // POST /admin/family/{familyId}/email  { newEmail }  — lost-mailbox recovery, no OTP: the
  // support workflow's own proof-of-purchase check (AD-13 §5 step 6) happens outside this API.
  if (request.method === 'POST' && segments[0] === 'family' && segments[2] === 'email') {
    const familyId = segments[1]!;
    let body: { newEmail?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response('invalid JSON', { status: 400 });
    }
    if (typeof body.newEmail !== 'string' || !body.newEmail.trim()) return new Response('newEmail is required', { status: 400 });

    const family = await getFamily(env, familyId);
    if (!family) return new Response('not found', { status: 404 });
    const newEmail = normalizeEmail(body.newEmail);
    const now = new Date().toISOString();
    await env.db.runTransaction(async (tx) => {
      tx.delete(emailIndexPath(await emailHashOf(family.email)));
      tx.set(emailIndexPath(await emailHashOf(newEmail)), { familyId, createdAt: now } satisfies EmailIndexDoc);
      tx.set(familyPath(familyId), { ...family, email: newEmail, updatedAt: now } satisfies FamilyDoc);
    });
    return jsonResponse({ familyId, email: newEmail });
  }

  // POST /admin/entitlements/{familyId}/{moduleId}  { status: 'active' | 'revoked' }
  if (request.method === 'POST' && segments[0] === 'entitlements') {
    const [, familyId, moduleId] = segments;
    let body: { status?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response('invalid JSON', { status: 400 });
    }
    if (body.status !== 'active' && body.status !== 'revoked') return new Response("status must be 'active' or 'revoked'", { status: 400 });

    const path = entitlementPath(familyId!, moduleId!);
    const existing = await env.db.get<EntitlementDoc>(path);
    const now = new Date().toISOString();
    const doc: EntitlementDoc = existing
      ? { ...existing, status: body.status, revokedAt: body.status === 'revoked' ? now : null, revokedReason: body.status === 'revoked' ? 'admin' : null }
      : {
          status: body.status, shopifyOrderId: 'admin-issued', grantedAt: now,
          revokedAt: body.status === 'revoked' ? now : null, revokedReason: body.status === 'revoked' ? 'admin' : null,
        };
    await env.db.set(path, doc);
    return jsonResponse({ familyId, moduleId, ...doc });
  }

  // POST /admin/sessions/{familyId}/revoke-all
  if (request.method === 'POST' && segments[0] === 'sessions' && segments[2] === 'revoke-all') {
    const familyId = segments[1]!;
    const active = await listActiveSessions(env, familyId);
    for (const session of active) await revokeSession(env, session.id);
    return jsonResponse({ revoked: active.length });
  }

  // POST /admin/welcome-email/{familyId}
  if (request.method === 'POST' && segments[0] === 'welcome-email') {
    const familyId = segments[1]!;
    const family = await getFamily(env, familyId);
    if (!family) return new Response('not found', { status: 404 });
    const outcome = await sendEmailWithConsent(env, moduleActivatedEmail(family.email, loginUrl(env), env.BEGINNER_LAUNCH === '1'));
    return jsonResponse({ emailSent: outcome === 'sent', ...(outcome === 'sent' ? {} : { reason: outcome === 'send_failed' ? 'send_failed' : 'no_consent' }) }, 202);
  }

  return new Response('not found', { status: 404 });
}
