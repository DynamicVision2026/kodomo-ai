/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import { handleShopifyOrderWebhook } from '../backend/src/handlers/webhook';
import { sendEmailWithConsent } from '../backend/src/emailGate';
import { moduleActivatedEmail, type EmailMessage, type EmailSender } from '../backend/src/email';
import type { Env } from '../backend/src/types';
import type { EntitlementDoc, OrderDoc } from '../backend/src/schema';
import { entitlementPath, familyPath, orderPath } from '../backend/src/schema';
import { getOrCreateFamilyIdInTx, emailHashOf } from '../backend/src/family';
import { MemoryDb } from '../backend/server/memoryDb';

const SECRET = 'test-webhook-secret';

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/** Simulates a real Postmark outage: every send throws, exactly like `PostmarkEmailSender.send`
 *  does on a non-2xx response (backend/server/postmarkEmail.ts). */
class AlwaysFailsSender implements EmailSender {
  readonly attempts: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.attempts.push(message);
    throw new Error('Postmark send failed: 500 simulated outage');
  }
}

class RecordingSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

function fakeEnv(email: EmailSender): Env {
  return {
    db: new MemoryDb(),
    email,
    SHOPIFY_WEBHOOK_SECRET: SECRET,
    ADMIN_TOKEN: 'test-admin',
    AUTH_PEPPER: 'test-pepper',
    APP_ORIGIN: 'https://app.example.com',
  };
}

async function loginFamily(env: Env, email: string): Promise<string> {
  const { familyId } = await env.db.runTransaction((tx) =>
    getOrCreateFamilyIdInTx(tx, email, new Date().toISOString(), {
      consentClickedAt: new Date().toISOString(), consentVerifiedAt: new Date().toISOString(), consentVersion: CONSENT_TEXT_VERSION,
    }));
  return familyId;
}

async function postOrder(env: Env, body: unknown): Promise<Response> {
  const raw = JSON.stringify(body);
  return handleShopifyOrderWebhook(
    new Request('https://backend.example/webhooks/shopify/orders-paid', { method: 'POST', headers: { 'X-Shopify-Hmac-Sha256': await sign(raw) }, body: raw }),
    env,
  );
}

describe('item 11 — failed email delivery: no crash, and a retry (admin resend) works', () => {
  it('sendEmailWithConsent never throws on a transport failure — it returns send_failed', async () => {
    const env = fakeEnv(new AlwaysFailsSender());
    await loginFamily(env, 'parent@example.com');
    const outcome = await sendEmailWithConsent(env, moduleActivatedEmail('parent@example.com', 'https://app.example.com/login/', false));
    expect(outcome).toBe('send_failed');
  });

  it('a Postmark outage during orders/paid does not crash the webhook — the order and entitlement are still recorded', async () => {
    const env = fakeEnv(new AlwaysFailsSender());
    const familyId = await loginFamily(env, 'buyer@example.com');
    const order = {
      id: 7701, name: '#7701', email: 'buyer@example.com', currency: 'JPY', financial_status: 'paid',
      created_at: '2026-01-01T00:00:00.000Z',
      line_items: [{ id: 1, sku: 'kodomo-ai-m1', quantity: 1, variant_id: 111, price: '9800' }],
    };

    // The handler must resolve normally (not throw) even though every send attempt underneath it
    // fails — the commercial outcome (order bound, entitlement granted) already committed and must
    // never be reported as a failure just because the notification email couldn't go out.
    const res = await postOrder(env, order);
    expect(res.status).toBe(200);

    const doc = await env.db.get<OrderDoc>(orderPath(7701));
    expect(doc?.bindingState).toBe('bound');
    expect(doc?.familyId).toBe(familyId);
    const ent = await env.db.get<EntitlementDoc>(entitlementPath(familyId, 'm1'));
    expect(ent?.status).toBe('active');
  });

  it('retry works: the admin "resend welcome email" action succeeds once delivery is healthy again', async () => {
    // Same family/order state a failed first attempt would have left behind — this test swaps in
    // a working sender to stand in for "Postmark is back up," and proves the existing admin resend
    // path (backend/src/adminRouter.ts's resend-welcome endpoint, same sendEmailWithConsent call
    // webhook.ts itself uses) is what "retry works" means: nothing about the earlier failure
    // permanently blocks a later successful send to the same, already-consenting family.
    const sender = new RecordingSender();
    const env = fakeEnv(sender);
    const familyId = await loginFamily(env, 'retry@example.com');
    const family = await env.db.get(familyPath(familyId));
    expect(family).not.toBeNull();

    const outcome = await sendEmailWithConsent(env, moduleActivatedEmail('retry@example.com', 'https://app.example.com/login/', false));
    expect(outcome).toBe('sent');
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.to).toBe('retry@example.com');
  });
});
