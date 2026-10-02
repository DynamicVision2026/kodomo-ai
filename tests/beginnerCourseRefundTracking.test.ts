/** @vitest-environment node */
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import { describe, it, expect } from 'vitest';
import { handleCourseLessonOpen } from '../backend/src/handlers/courseLessonOpen';
import { handleCreateProfile } from '../backend/src/handlers/profiles';
import type { Env } from '../backend/src/types';
import type { OrderDoc, UsageDoc } from '../backend/src/schema';
import { entitlementPath, usagePath } from '../backend/src/schema';
import { createSession, SESSION_COOKIE_NAME } from '../backend/src/session';
import { getOrCreateFamilyIdInTx } from '../backend/src/family';
import { computeEligibilitySnapshot } from '../backend/src/refund';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';

// Founder, 2 Oct 2026: "Build the refund tracking now. Record the first opening of Lessons 2 to 7
// in the backend, and only when the family has the licence. Reuse the existing usage record so the
// admin 'refund eligible' field picks it up. Opening Lesson 1, the course home or the account page
// must not count." — plus the 5 scenarios given verbatim as "Tests as in COPY-02 section 9", later
// corrected (COPY-02, 2 Oct 2026) to a 3-day window (not the 10-day figure this suite originally
// assumed): "Lesson 1 only is eligible, Lesson 2 opened is not, 4 days with nothing opened is NOT
// eligible [corrected], login only is still eligible, and a refund keeps Lesson 1 open."
//
// handlers/courseLessonOpen.ts is the new endpoint under test; computeEligibilitySnapshot
// (backend/src/refund.ts) is the admin refund-eligibility computation this feature deliberately
// reuses by writing to the exact same `usage/{moduleId}` doc `/units/open` already writes to — see
// that handler's own header comment. Its own `DEFAULT_POLICY.windowDays` is 3 (COPY-02).

function fakeEnv(): Env {
  return {
    db: new MemoryDb(),
    email: new FakeEmailSender(),
    SHOPIFY_WEBHOOK_SECRET: 'test-webhook',
    ADMIN_TOKEN: 'test-admin',
    AUTH_PEPPER: 'test-pepper',
    APP_ORIGIN: 'https://app.example.com',
  };
}

function authedRequest(path: string, token: string, init: RequestInit = {}): Request {
  return new Request(`https://backend.example${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.example.com',
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function seedLicensedFamilyWithProfile(env: Env, email: string): Promise<{ familyId: string; token: string; profileId: string }> {
  const { familyId } = await env.db.runTransaction((tx) =>
    getOrCreateFamilyIdInTx(tx, email, new Date().toISOString(), {
      consentClickedAt: new Date().toISOString(),
      consentVerifiedAt: new Date().toISOString(),
      consentVersion: CONSENT_TEXT_VERSION,
    }),
  );
  await env.db.set(entitlementPath(familyId, 'm1'), {
    status: 'active', shopifyOrderId: 'o1', grantedAt: new Date().toISOString(), revokedAt: null, revokedReason: null,
  });
  const { token } = await createSession(env, familyId, 'test-device');
  const createRes = await handleCreateProfile(
    authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }),
    env,
  );
  const { id: profileId } = await createRes.json();
  return { familyId, token, profileId };
}

function orderFor(familyId: string, paidAt: Date): Pick<OrderDoc, 'paidAt' | 'lines' | 'familyId'> {
  return {
    paidAt: paidAt.toISOString(),
    lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 9800 }],
    familyId,
  };
}

describe('Beginner-course refund tracking (Founder, 2 Oct 2026) — COPY-02 §9 scenarios', () => {
  it('Lesson 1 only is eligible: opening the free sample records no usage at all', async () => {
    const env = fakeEnv();
    const { familyId, token, profileId } = await seedLicensedFamilyWithProfile(env, 'lesson1only@example.com');

    const res = await handleCourseLessonOpen(
      authedRequest('/api/v1/course-lessons/b01/open', token, { method: 'POST', body: JSON.stringify({ profileId }) }),
      env, 'b01',
    );
    expect(res.status).toBe(200);
    expect(await env.db.get<UsageDoc>(usagePath(familyId, 'm1'))).toBeNull();

    const snapshot = await computeEligibilitySnapshot(env, orderFor(familyId, new Date()), new Date());
    expect(snapshot.paidContentUsed).toBe(false);
    expect(snapshot.objectivelyEligible).toBe(true);
  });

  it('Lesson 2 opened is not eligible: it records usage and flips objectivelyEligible to false', async () => {
    const env = fakeEnv();
    const { familyId, token, profileId } = await seedLicensedFamilyWithProfile(env, 'lesson2opened@example.com');

    const res = await handleCourseLessonOpen(
      authedRequest('/api/v1/course-lessons/b02/open', token, { method: 'POST', body: JSON.stringify({ profileId }) }),
      env, 'b02',
    );
    expect(res.status).toBe(200);
    const usage = await env.db.get<UsageDoc>(usagePath(familyId, 'm1'));
    expect(usage?.firstPaidUnitId).toBe('b02');
    expect(usage?.firstPaidProfileId).toBe(profileId);

    // The order's own `paidAt` must be BEFORE the lesson-open above (purchase, then usage) for
    // this to mean what it says — `orderFor(familyId, new Date())` here would otherwise capture a
    // `paidAt` AFTER the write, which backend/src/refund.ts's own "a usage record from before this
    // purchase never counts" guard would then (correctly, for THAT timing) treat as pre-purchase.
    // `requestedAt` also must be strictly after `firstPaidUseAt` for `paidContentUsed` to be true.
    const snapshot = await computeEligibilitySnapshot(
      env, orderFor(familyId, new Date(Date.now() - 60 * 60 * 1000)), new Date(Date.now() + 1000),
    );
    expect(snapshot.paidContentUsed).toBe(true);
    expect(snapshot.objectivelyEligible).toBe(false);
  });

  it('4 days with nothing opened is NOT eligible: the window is 3 days (COPY-02 correction), so elapsed time alone can still disqualify', async () => {
    const env = fakeEnv();
    const { familyId } = await seedLicensedFamilyWithProfile(env, 'fourdaysidle@example.com');
    expect(await env.db.get<UsageDoc>(usagePath(familyId, 'm1'))).toBeNull();

    const paidAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const snapshot = await computeEligibilitySnapshot(env, orderFor(familyId, paidAt), new Date());
    expect(snapshot.withinWindow).toBe(false);
    expect(snapshot.paidContentUsed).toBe(false);
    expect(snapshot.objectivelyEligible).toBe(false);
  });

  it('login only is still eligible: a session with no lesson ever opened records no usage', async () => {
    const env = fakeEnv();
    const { familyId } = await seedLicensedFamilyWithProfile(env, 'loginonly@example.com');
    expect(await env.db.get<UsageDoc>(usagePath(familyId, 'm1'))).toBeNull();

    const snapshot = await computeEligibilitySnapshot(env, orderFor(familyId, new Date()), new Date());
    expect(snapshot.paidContentUsed).toBe(false);
    expect(snapshot.objectivelyEligible).toBe(true);
  });

  it('a refund keeps Lesson 1 open: a revoked m1 entitlement still lets b01 open, recording nothing', async () => {
    const env = fakeEnv();
    const { familyId, profileId } = await seedLicensedFamilyWithProfile(env, 'refunded@example.com');
    await env.db.set(entitlementPath(familyId, 'm1'), {
      status: 'revoked', shopifyOrderId: 'o1', grantedAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(), revokedReason: 'refund',
    });

    const { token } = await createSession(env, familyId, 'test-device-2');
    const res = await handleCourseLessonOpen(
      authedRequest('/api/v1/course-lessons/b01/open', token, { method: 'POST', body: JSON.stringify({ profileId }) }),
      env, 'b01',
    );
    expect(res.status).toBe(200);
    expect(await env.db.get<UsageDoc>(usagePath(familyId, 'm1'))).toBeNull();
  });

  it('opening Lesson 2 without an active licence records nothing (not a content gate, just never evidence of PAID use)', async () => {
    const env = fakeEnv();
    const { familyId } = await env.db.runTransaction((tx) =>
      getOrCreateFamilyIdInTx(tx, 'unlicensed@example.com', new Date().toISOString(), {
        consentClickedAt: new Date().toISOString(), consentVerifiedAt: new Date().toISOString(), consentVersion: CONSENT_TEXT_VERSION,
      }),
    );
    const { token } = await createSession(env, familyId, 'test-device');
    const createRes = await handleCreateProfile(
      authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }),
      env,
    );
    const { id: profileId } = await createRes.json();

    const res = await handleCourseLessonOpen(
      authedRequest('/api/v1/course-lessons/b02/open', token, { method: 'POST', body: JSON.stringify({ profileId }) }),
      env, 'b02',
    );
    expect(res.status).toBe(200);
    expect(await env.db.get<UsageDoc>(usagePath(familyId, 'm1'))).toBeNull();
  });

  it('opening a second tracked lesson never overwrites the first-ever recorded usage', async () => {
    const env = fakeEnv();
    const { familyId, token, profileId } = await seedLicensedFamilyWithProfile(env, 'secondlesson@example.com');
    await handleCourseLessonOpen(
      authedRequest('/api/v1/course-lessons/b02/open', token, { method: 'POST', body: JSON.stringify({ profileId }) }),
      env, 'b02',
    );
    const firstUsage = await env.db.get<UsageDoc>(usagePath(familyId, 'm1'));
    await handleCourseLessonOpen(
      authedRequest('/api/v1/course-lessons/b03/open', token, { method: 'POST', body: JSON.stringify({ profileId }) }),
      env, 'b03',
    );
    const usageAfter = await env.db.get<UsageDoc>(usagePath(familyId, 'm1'));
    expect(usageAfter?.firstPaidUnitId).toBe('b02');
    expect(usageAfter?.firstPaidUseAt).toBe(firstUsage?.firstPaidUseAt);
  });

  it('a usage record from BEFORE this purchase (a prior entitlement period, refunded and repurchased) never counts against the NEW purchase\'s own window', async () => {
    const env = fakeEnv();
    const familyId = 'f-repurchase';
    // A stale usage doc from a PAST entitlement period for the same moduleId — e.g. the family
    // bought, opened a paid lesson, was refunded, and is now buying again.
    const staleUseAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    await env.db.set(usagePath(familyId, 'm1'), {
      firstPaidUseAt: staleUseAt.toISOString(), firstPaidUnitId: 'b02', firstPaidProfileId: 'p-old',
    });

    // The NEW purchase happened AFTER that stale usage record, and nothing has been opened since.
    const newPaidAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    const order: Pick<OrderDoc, 'paidAt' | 'lines' | 'familyId'> = {
      paidAt: newPaidAt.toISOString(),
      lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 4980 }],
      familyId,
    };
    const snapshot = await computeEligibilitySnapshot(env, order, new Date());
    expect(snapshot.paidContentUsed).toBe(false);
    expect(snapshot.firstPaidUseAt).toBeNull();
    expect(snapshot.objectivelyEligible).toBe(true);
  });

  it('a usage record written AFTER this purchase still correctly counts against it', async () => {
    const env = fakeEnv();
    const familyId = 'f-genuine-use';
    const paidAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    const usedAt = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago — after paidAt
    await env.db.set(usagePath(familyId, 'm1'), {
      firstPaidUseAt: usedAt.toISOString(), firstPaidUnitId: 'b02', firstPaidProfileId: 'p1',
    });
    const order: Pick<OrderDoc, 'paidAt' | 'lines' | 'familyId'> = {
      paidAt: paidAt.toISOString(),
      lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 4980 }],
      familyId,
    };
    const snapshot = await computeEligibilitySnapshot(env, order, new Date());
    expect(snapshot.paidContentUsed).toBe(true);
    expect(snapshot.objectivelyEligible).toBe(false);
  });
});
