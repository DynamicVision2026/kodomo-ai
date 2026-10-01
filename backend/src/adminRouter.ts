import { sendEmailWithConsent } from './emailGate.js';
import type { Env } from './types.js';
import type {
  ClaimDoc, EntitlementDoc, FamilyDoc, OrderDoc, ProfileDoc, ProgressDoc, SessionDoc, TrialDoc, UsageDoc,
} from './schema.js';
import {
  claimPath, emailIndexPath, entitlementPath, entitlementsCollection, familyPath, ordersCollection,
  orderPath, profilesCollection, progressCollection, sessionsCollection, trialsCollection, usagePath,
} from './schema.js';
import { emailHashOf, findFamilyIdByEmail, getFamily, normalizeEmail } from './family.js';
import { resolveStaffIdentity, canWrite, type StaffIdentity } from './staff.js';
import { listActiveSessions, revokeSession } from './session.js';
import { writeAuditLog, listAuditLogForTarget, listAuditLogForActor } from './audit.js';
import { computeEligibilitySnapshot } from './refund.js';
import { moduleActivatedEmail, claimYourPurchaseEmail } from './email.js';
import { randomToken, hmacHex } from './util.js';
import { activationLoginUrl, claimUrl, shopifyAdminOrderUrl } from './links.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return email;
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

/** AD-16 §8: "reason (required for every staff write)." Applied to every mutating admin
 *  endpoint below, uniformly. */
function requireReason(body: { reason?: unknown }): string | null {
  return typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The `kodomo-ai-admin` service's own API surface — AD-16 §8. Every route requires a verified
 * IAP identity resolved against the `staff/` allowlist; read-only routes accept `viewer`,
 * mutating ones require `operator` (`canWrite`). Deliberately a SEPARATE router/dispatcher from
 * `backend/src/router.ts` — nothing here is ever reachable through the public backend, and
 * nothing public-facing is reachable through this one either (AD-16: "nothing admin-related ships
 * in the public frontend or backend").
 */
export async function handleAdminApi(request: Request, env: Env, url: URL): Promise<Response> {
  const staff = await resolveStaffIdentity(request, env);
  if (!staff) return new Response('unauthorized', { status: 401 });

  const segments = url.pathname.replace(/^\/admin-api\//, '').split('/').filter(Boolean);
  const method = request.method;

  // GET /admin-api/me — the dashboard's own "who am I / what can I do" check, so it can hide or
  // disable operator-only controls up front instead of letting a viewer discover the 403 by
  // trying. Never anything more than the identity `resolveStaffIdentity` already resolved above.
  if (method === 'GET' && segments[0] === 'me') {
    return jsonResponse({ email: staff.email, role: staff.role });
  }

  // GET /admin-api/search?q=...
  if (method === 'GET' && segments[0] === 'search') {
    return handleSearch(request, env, url);
  }

  if (segments[0] === 'families' && segments[1]) {
    return routeFamily(request, env, staff, segments, url);
  }

  if (segments[0] === 'orders' && segments[1]) {
    return routeOrder(request, env, staff, segments);
  }

  if (method === 'GET' && segments[0] === 'queues' && segments[1]) {
    return handleQueue(env, segments[1]);
  }

  if (method === 'GET' && segments[0] === 'audit') {
    const targetId = url.searchParams.get('targetId');
    const actor = url.searchParams.get('actor');
    if (!targetId && !actor) return new Response('targetId or actor is required', { status: 400 });
    const entries = targetId ? await listAuditLogForTarget(env, targetId) : await listAuditLogForActor(env, actor!);
    return jsonResponse(entries.map((e) => e.data));
  }

  return new Response('not found', { status: 404 });
}

/** AD-16 §8: "one box — account email, purchaser email, order number, Shopify order ID, or
 *  family ID." Tries each interpretation independently rather than guessing which one `q` is. */
async function handleSearch(request: Request, env: Env, url: URL): Promise<Response> {
  const q = url.searchParams.get('q')?.trim();
  if (!q) return new Response('q is required', { status: 400 });

  const results: { families: { familyId: string; email: string }[]; orders: { shopifyOrderId: string; orderName: string }[] } = {
    families: [], orders: [],
  };

  const familyIdCandidates = new Set<string>();
  const byEmail = await findFamilyIdByEmail(env, await emailHashOf(q));
  if (byEmail) familyIdCandidates.add(byEmail);
  if (await env.db.get<FamilyDoc>(familyPath(q))) familyIdCandidates.add(q);

  for (const candidateId of familyIdCandidates) {
    const family = await getFamily(env, candidateId);
    if (family) results.families.push({ familyId: candidateId, email: family.email });
  }

  const byOrderId = await env.db.get<OrderDoc>(orderPath(q));
  if (byOrderId) results.orders.push({ shopifyOrderId: byOrderId.shopifyOrderId, orderName: byOrderId.orderName });

  const normalizedQ = normalizeEmail(q);
  const allOrders = await env.db.list<OrderDoc>(ordersCollection());
  for (const o of allOrders) {
    if (o.data.orderName === q || o.data.purchaserEmail === normalizedQ) {
      if (!results.orders.some((r) => r.shopifyOrderId === o.data.shopifyOrderId)) {
        results.orders.push({ shopifyOrderId: o.data.shopifyOrderId, orderName: o.data.orderName });
      }
    }
  }

  return jsonResponse(results);
}

async function routeFamily(request: Request, env: Env, staff: StaffIdentity, segments: string[], url: URL): Promise<Response> {
  const familyId = segments[1]!;
  const method = request.method;

  if (method === 'GET' && segments.length === 2) {
    const family = await getFamily(env, familyId);
    if (!family) return new Response('not found', { status: 404 });

    const profiles = await env.db.list<ProfileDoc>(profilesCollection(familyId));
    const entitlements = await env.db.list<EntitlementDoc>(entitlementsCollection(familyId));
    const trials = await env.db.list<TrialDoc>(trialsCollection(familyId));
    const sessions = await listActiveSessions(env, familyId);
    const allOrders = await env.db.list<OrderDoc>(ordersCollection());
    const orders = allOrders.filter((o) => o.data.familyId === familyId).map((o) => o.data);

    const profileSummaries = profiles.map((p) => ({
      id: p.id, avatarId: p.data.avatarId, nicknameId: p.data.nicknameId, stage: p.data.stage,
      progressSummary: [] as { moduleId: string; unitsCompleted: number }[],
    }));
    await Promise.all(profiles.map(async (p, i) => {
      const progress = await env.db.list<ProgressDoc>(progressCollection(familyId, p.id));
      profileSummaries[i]!.progressSummary = progress.map((pr) => ({
        moduleId: pr.id,
        unitsCompleted: Object.values(pr.data.missions).filter((m) => m.done).length,
      }));
    }));

    // Work order §1 "firstPaidUseAt (yes/no, time, which lesson)" — genuinely a per-FAMILY-per-
    // MODULE fact (UsageDoc lives at families/{id}/usage/{moduleId}, never per profile: whichever
    // child in the household opens a paid lesson first sets it for the whole module, which is
    // also exactly what refund eligibility reads — backend/src/refund.ts). Attaching the same
    // value to every profile row (the old shape) would have been misleading, not just incomplete.
    const usage = await Promise.all(entitlements.map(async (e) => {
      const doc = await env.db.get<UsageDoc>(usagePath(familyId, e.id));
      return { moduleId: e.id, used: !!doc, firstPaidUseAt: doc?.firstPaidUseAt ?? null, firstPaidUnitId: doc?.firstPaidUnitId ?? null };
    }));

    return jsonResponse({
      familyId,
      email: staff.role === 'operator' ? family.email : maskEmail(family.email),
      createdAt: family.createdAt,
      status: family.status,
      profiles: profileSummaries,
      trials: trials.map((t) => ({ moduleId: t.id, ...t.data })),
      entitlements: entitlements.map((e) => ({ moduleId: e.id, ...e.data })),
      usage,
      orders,
      sessions: sessions.map((s) => ({ id: s.id, label: s.data.label, lastSeenAt: s.data.lastSeenAt })),
    });
  }

  if (!canWrite(staff)) return new Response('forbidden', { status: 403 });

  if (method === 'POST' && segments[2] === 'resend-welcome') {
    const body = await readJson<{ reason?: unknown }>(request);
    const reason = body && requireReason(body);
    if (!reason) return new Response('reason is required', { status: 400 });
    const family = await getFamily(env, familyId);
    if (!family) return new Response('not found', { status: 404 });
    const outcome = await sendEmailWithConsent(env, moduleActivatedEmail(family.email, activationLoginUrl(env, family.email), env.BEGINNER_LAUNCH === '1'));
    await writeAuditLog(env, { actor: staff.email, action: 'resend_welcome', targetType: 'family', targetId: familyId, before: null, after: { emailSent: outcome === 'sent' }, reason });
    return jsonResponse({ emailSent: outcome === 'sent', ...(outcome === 'sent' ? {} : { reason: outcome === 'send_failed' ? 'send_failed' : 'no_consent' }) }, 202);
  }

  if (method === 'POST' && segments[2] === 'email') {
    const body = await readJson<{ newEmail?: unknown; reason?: unknown }>(request);
    const reason = body && requireReason(body);
    if (!reason) return new Response('reason is required', { status: 400 });
    if (!body || typeof body.newEmail !== 'string' || !body.newEmail.trim()) return new Response('newEmail is required', { status: 400 });

    const family = await getFamily(env, familyId);
    if (!family) return new Response('not found', { status: 404 });
    const newEmail = normalizeEmail(body.newEmail);
    const now = new Date().toISOString();
    await env.db.runTransaction(async (tx) => {
      tx.delete(emailIndexPath(await emailHashOf(family.email)));
      tx.set(emailIndexPath(await emailHashOf(newEmail)), { familyId, createdAt: now });
      tx.set(familyPath(familyId), { ...family, email: newEmail, updatedAt: now } satisfies FamilyDoc);
    });
    await writeAuditLog(env, { actor: staff.email, action: 'change_email', targetType: 'family', targetId: familyId, before: { email: family.email }, after: { email: newEmail }, reason });
    return jsonResponse({ familyId, email: newEmail });
  }

  if (method === 'POST' && segments[2] === 'entitlements' && segments[3]) {
    const moduleId = segments[3];
    const body = await readJson<{ status?: unknown; reason?: unknown }>(request);
    const reason = body && requireReason(body);
    if (!reason) return new Response('reason is required', { status: 400 });
    if (!body || (body.status !== 'active' && body.status !== 'revoked')) return new Response("status must be 'active' or 'revoked'", { status: 400 });

    const path = entitlementPath(familyId, moduleId);
    const existing = await env.db.get<EntitlementDoc>(path);
    const now = new Date().toISOString();
    const doc: EntitlementDoc = {
      status: body.status, shopifyOrderId: existing?.shopifyOrderId ?? 'admin-issued', grantedAt: existing?.grantedAt ?? now,
      revokedAt: body.status === 'revoked' ? now : null, revokedReason: body.status === 'revoked' ? 'admin' : null,
    };
    await env.db.set(path, doc);
    await writeAuditLog(env, { actor: staff.email, action: 'set_entitlement', targetType: 'family', targetId: familyId, before: existing, after: doc, reason });
    return jsonResponse({ familyId, moduleId, ...doc });
  }

  if (method === 'POST' && segments[2] === 'sessions' && segments[3] === 'revoke-all') {
    const body = await readJson<{ reason?: unknown }>(request);
    const reason = body && requireReason(body);
    if (!reason) return new Response('reason is required', { status: 400 });
    const active = await listActiveSessions(env, familyId);
    for (const session of active) await revokeSession(env, session.id);
    await writeAuditLog(env, { actor: staff.email, action: 'revoke_sessions', targetType: 'family', targetId: familyId, before: { count: active.length }, after: null, reason });
    return jsonResponse({ revoked: active.length });
  }

  return new Response('not found', { status: 404 });
}

async function routeOrder(request: Request, env: Env, staff: StaffIdentity, segments: string[]): Promise<Response> {
  const orderId = segments[1]!;
  const method = request.method;

  if (method === 'GET' && segments.length === 2) {
    const order = await env.db.get<OrderDoc>(orderPath(orderId));
    if (!order) return new Response('not found', { status: 404 });
    // Work order §1 "Order page": "amount" (the order's own total — never re-derived from
    // Shopify, just the sum of what the webhook itself already recorded per line) and "a direct
    // link to the order in Shopify admin" — both computed here so OrderView.tsx never needs to
    // know the shop domain or re-sum lines itself.
    const amountTotal = order.lines.reduce((sum, l) => sum + l.lineTotal, 0);
    return jsonResponse({ ...order, amountTotal, shopifyAdminUrl: shopifyAdminOrderUrl(env, order.shopifyOrderId) });
  }

  if (!canWrite(staff)) return new Response('forbidden', { status: 403 });

  const order = await env.db.get<OrderDoc>(orderPath(orderId));
  if (!order) return new Response('not found', { status: 404 });

  if (method === 'POST' && segments[2] === 'bind') {
    const body = await readJson<{ familyId?: unknown; reason?: unknown }>(request);
    const reason = body && requireReason(body);
    if (!reason) return new Response('reason is required', { status: 400 });
    if (!body || typeof body.familyId !== 'string') return new Response('familyId is required', { status: 400 });
    const targetFamilyId = body.familyId;

    const now = new Date().toISOString();
    const updated = await env.db.runTransaction(async (tx) => {
      // Reads first — a multi-line order would otherwise read line 2's entitlement AFTER line
      // 1's write, the same class of bug webhook.ts's orders/paid transaction had.
      const existingEntitlements = new Map<string, EntitlementDoc | null>();
      for (const line of order.lines) {
        existingEntitlements.set(line.moduleId, await tx.get<EntitlementDoc>(entitlementPath(targetFamilyId, line.moduleId)));
      }

      let entitlementState: OrderDoc['entitlementState'] = 'none';
      const entitlementWrites: { path: string; doc: EntitlementDoc }[] = [];
      for (const line of order.lines) {
        const existingEnt = existingEntitlements.get(line.moduleId) ?? null;
        if (existingEnt && existingEnt.status === 'active') { entitlementState = 'duplicate'; continue; }
        const ent: EntitlementDoc = { status: 'active', shopifyOrderId: orderId, grantedAt: now, revokedAt: null, revokedReason: null };
        entitlementWrites.push({ path: entitlementPath(targetFamilyId, line.moduleId), doc: ent });
        entitlementState = entitlementState === 'duplicate' ? 'duplicate' : 'granted';
      }
      const doc: OrderDoc = { ...order, familyId: targetFamilyId, bindingMethod: 'admin', bindingState: 'bound', entitlementState, updatedAt: now };
      for (const w of entitlementWrites) tx.set(w.path, w.doc);
      tx.set(orderPath(orderId), doc);
      return doc;
    });
    await writeAuditLog(env, { actor: staff.email, action: 'admin_bind', targetType: 'order', targetId: orderId, before: order, after: updated, reason });
    if (updated.entitlementState === 'granted') {
      const family = await getFamily(env, targetFamilyId);
      if (family) await sendEmailWithConsent(env, moduleActivatedEmail(family.email, activationLoginUrl(env, family.email), env.BEGINNER_LAUNCH === '1'));
    }
    return jsonResponse(updated);
  }

  if (method === 'POST' && segments[2] === 'resend-claim') {
    const body = await readJson<{ reason?: unknown }>(request);
    const reason = body && requireReason(body);
    if (!reason) return new Response('reason is required', { status: 400 });
    if (!order.purchaserEmail) return new Response('order has no purchaser email', { status: 400 });
    const claimToken = randomToken(32);
    const claimHash = await hmacHex(claimToken, env.AUTH_PEPPER);
    const now = new Date();
    const claim: ClaimDoc = {
      orderId, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      redeemedAt: null, familyId: null,
    };
    await env.db.set(claimPath(claimHash), claim);
    const outcome = await sendEmailWithConsent(env, claimYourPurchaseEmail(order.purchaserEmail, order.orderName, claimUrl(env, claimToken), env.BEGINNER_LAUNCH === '1'));
    await writeAuditLog(env, { actor: staff.email, action: 'resend_claim', targetType: 'order', targetId: orderId, before: null, after: { emailSent: outcome === 'sent' }, reason });
    return jsonResponse({ emailSent: outcome === 'sent', ...(outcome === 'sent' ? {} : { reason: outcome === 'send_failed' ? 'send_failed' : 'no_consent' }) }, 202);
  }

  if (method === 'POST' && segments[2] === 'refund-request') {
    const body = await readJson<{ requestChannel?: unknown; reason?: unknown }>(request);
    const reason = body && requireReason(body);
    if (!reason) return new Response('reason is required', { status: 400 });
    const requestedAt = new Date();
    const snapshot = await computeEligibilitySnapshot(env, order, requestedAt);
    const updated: OrderDoc = {
      ...order,
      refund: {
        ...order.refund, state: 'requested', requestedAt: requestedAt.toISOString(),
        requestChannel: typeof body?.requestChannel === 'string' ? body.requestChannel : null,
        eligibilitySnapshot: snapshot,
      },
      updatedAt: requestedAt.toISOString(),
    };
    await env.db.set(orderPath(orderId), updated);
    await writeAuditLog(env, { actor: staff.email, action: 'refund_request', targetType: 'order', targetId: orderId, before: order.refund, after: updated.refund, reason });
    return jsonResponse(updated);
  }

  if (method === 'POST' && segments[2] === 'refund-decision') {
    const body = await readJson<{ decision?: unknown; reason?: unknown }>(request);
    const reason = body && requireReason(body);
    if (!reason) return new Response('reason is required', { status: 400 });
    if (body?.decision !== 'approved' && body?.decision !== 'declined') return new Response("decision must be 'approved' or 'declined'", { status: 400 });

    const now = new Date().toISOString();
    const updated: OrderDoc = {
      ...order,
      refund: { ...order.refund, decision: body.decision, state: body.decision === 'declined' ? 'declined' : order.refund.state },
      updatedAt: now,
    };
    await env.db.set(orderPath(orderId), updated);
    await writeAuditLog(env, { actor: staff.email, action: 'refund_decision', targetType: 'order', targetId: orderId, before: order.refund, after: updated.refund, reason });
    // AD-16 §7: "if approved: staff issue the refund IN SHOPIFY ADMIN" — never automated here.
    return jsonResponse(updated);
  }

  return new Response('not found', { status: 404 });
}

/**
 * AD-16 §9: each of these is a single-field equality filter — Firestore auto-creates the needed
 * single-field index for every one of `bindingState`/`entitlementState` (top-level fields), so
 * this needs no entry in firestore.indexes.json. `refund.state` is a nested field; queried via
 * `Db.query`'s dot-path support the same way (Firestore auto-indexes nested fields identically to
 * top-level ones — only a *composite*, multi-field query needs an explicit index entry, and none
 * of these queues filter on more than one field).
 */
async function handleQueue(env: Env, queueName: string): Promise<Response> {
  let docs: { data: OrderDoc }[];
  switch (queueName) {
    case 'awaiting_claim':
      docs = await env.db.query<OrderDoc>(ordersCollection(), 'bindingState', 'awaiting_claim');
      break;
    case 'needs_review':
      docs = await env.db.query<OrderDoc>(ordersCollection(), 'bindingState', 'needs_review');
      break;
    case 'duplicate':
      docs = await env.db.query<OrderDoc>(ordersCollection(), 'entitlementState', 'duplicate');
      break;
    case 'refund_requests':
      docs = await env.db.query<OrderDoc>(ordersCollection(), 'refund.state', 'requested');
      break;
    default:
      return new Response('unknown queue', { status: 400 });
  }
  return jsonResponse(docs.map((d) => d.data));
}
