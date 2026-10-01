import { sendEmailWithConsent } from '../emailGate.js';
import type { Env } from '../types.js';
import type { EmailIndexDoc, FamilyDoc, ProfileDoc, ProgressDoc, SessionDoc } from '../schema.js';
import { emailIndexPath, familyPath, profilePath, profilesCollection, progressCollection, sessionsCollection } from '../schema.js';
import { resolveSession, revokeSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { verifyRawCode, sendVerificationCode } from '../loginCode.js';
import { emailHashOf, findFamilyIdByEmail, getFamily, normalizeEmail } from '../family.js';
import { emailChangedEmail } from '../email.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * POST /api/v1/account/email — AD-13 §3/§5 step 6, two-step:
 *  - body `{ newEmail }` (no `code`): sends a code to `newEmail` and returns 202.
 *  - body `{ newEmail, code }`: verifies that code, then applies the change — moves the
 *    `emailIndex` entry, updates `family.email`, and notifies BOTH the old and new address
 *    (AD-13 §4: "Email changed — sent to both the old and new addresses").
 */
export async function handleAccountEmail(request: Request, env: Env): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  let body: { newEmail?: unknown; code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.newEmail !== 'string' || !body.newEmail.trim()) {
    return new Response('newEmail is required', { status: 400 });
  }
  const newEmail = normalizeEmail(body.newEmail);
  const familyId = resolved.session.familyId;

  // Post-launch-check (Founder, iPhone test): changing info@ to info@ sent TWO "your login email
  // changed" notifications to the same address (both `emailChangedEmail` calls below fire with
  // oldEmail === newEmail once the no-op change completes). Caught here, before any code is even
  // sent — never as a special case of "email already in use" below, since `findFamilyIdByEmail`
  // for THIS family's own current address always resolves to `familyId` itself, never taking
  // that branch.
  const currentFamily = await getFamily(env, familyId);
  if (!currentFamily) return new Response('not found', { status: 404 });
  if (newEmail === normalizeEmail(currentFamily.email)) {
    return new Response(JSON.stringify({ error: 'same_email' }), { status: 409, headers: { 'content-type': 'application/json' } });
  }

  const newEmailFamilyId = await findFamilyIdByEmail(env, await emailHashOf(newEmail));
  if (newEmailFamilyId && newEmailFamilyId !== familyId) {
    return new Response(JSON.stringify({ error: 'email_in_use' }), { status: 409, headers: { 'content-type': 'application/json' } });
  }

  if (typeof body.code !== 'string' || !body.code) {
    await sendVerificationCode(env, newEmail, familyId);
    return new Response(null, { status: 202 });
  }

  const outcome = await verifyRawCode(env, newEmail, body.code);
  if (outcome !== 'ok') {
    return jsonResponse({ error: outcome }, 401);
  }

  const family = currentFamily;
  const oldEmail = family.email;
  const now = new Date().toISOString();

  await env.db.runTransaction(async (tx) => {
    tx.delete(emailIndexPath(await emailHashOf(oldEmail)));
    tx.set(emailIndexPath(await emailHashOf(newEmail)), { familyId, createdAt: now } satisfies EmailIndexDoc);
    tx.set(familyPath(familyId), { ...family, email: newEmail, updatedAt: now } satisfies FamilyDoc);
  });

  await sendEmailWithConsent(env, emailChangedEmail(oldEmail, newEmail), { kind: 'family', familyId });
  await sendEmailWithConsent(env, emailChangedEmail(newEmail, oldEmail), { kind: 'family', familyId });
  return jsonResponse({ email: newEmail });
}

/**
 * DELETE /api/v1/account — AD-13 §3/§5 step 6/AD-13 acceptance test 14: "requires an OTP
 * verified within the last 10 minutes." The client gets that fresh code the same way any other
 * confirmation code is requested (`POST /auth/request` with the family's own, already-known
 * email) — this route only ever verifies it, never issues one itself, so a stolen session cookie
 * alone can never delete the account without also intercepting a real email.
 */
export async function handleDeleteAccount(request: Request, env: Env): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  let body: { code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.code !== 'string' || !body.code) return new Response('code is required', { status: 400 });

  const familyId = resolved.session.familyId;
  const family = await getFamily(env, familyId);
  if (!family) return new Response('not found', { status: 404 });

  const outcome = await verifyRawCode(env, family.email, body.code);
  if (outcome !== 'ok') return jsonResponse({ error: outcome }, 401);

  const profiles = await env.db.list<ProfileDoc>(profilesCollection(familyId));
  const sessions = await env.db.query<SessionDoc>(sessionsCollection(), 'familyId', familyId);
  const progressByProfile = await Promise.all(
    profiles.map((profile) => env.db.list<ProgressDoc>(progressCollection(familyId, profile.id))),
  );

  const emailHash = await emailHashOf(family.email);
  await env.db.runTransaction(async (tx) => {
    profiles.forEach((profile, i) => {
      for (const progress of progressByProfile[i]!) {
        tx.delete(`${progressCollection(familyId, profile.id)}/${progress.id}`);
      }
      tx.delete(profilePath(familyId, profile.id));
    });
    for (const session of sessions) tx.delete(`${sessionsCollection()}/${session.id}`);
    tx.delete(emailIndexPath(emailHash));
    tx.delete(familyPath(familyId));
  });

  return new Response(null, { status: 204 });
}
