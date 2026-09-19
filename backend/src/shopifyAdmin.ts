import type { Env } from './types.js';

/**
 * Best-effort Shopify Admin API side effect: writes the issued code(s) onto the order as a
 * metafield, so a Shopify Flow workflow (not this Worker) can email the buyer. Deliberately
 * NOT the source of truth — redemption (backend/src/handlers/unlock.ts) only ever reads KV.
 * If this call fails, the code still exists and is still redeemable; only the automated email
 * would need a manual resend, which the runbook (docs/task7-shopify-worker-runbook.md) covers.
 *
 * Why a metafield + Flow, not editing the "Order confirmation" template: Shopify's default
 * confirmation email is typically sent at order creation, which can race ahead of this
 * webhook (fired on orders/paid) writing the metafield — customizing that shared template
 * risks sometimes shipping an email with a blank code slot. A Flow triggered BY the metafield
 * write can't race it, and — just as important for the isolation requirement — it is a new,
 * separate automation, not an edit to the shared confirmation/shipping templates products
 * A-D also use, so there is nothing to accidentally break for them.
 */
export async function attachCodesToOrderMetafield(
  env: Env,
  orderId: number,
  codes: string[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_TOKEN) {
    return { ok: false, reason: 'SHOPIFY_SHOP_DOMAIN/SHOPIFY_ADMIN_API_TOKEN not configured' };
  }
  try {
    const res = await fetch(
      `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders/${orderId}/metafields.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_API_TOKEN,
        },
        body: JSON.stringify({
          metafield: {
            namespace: 'naze',
            key: 'family_code',
            type: 'single_line_text_field',
            value: codes.join(', '),
          },
        }),
      },
    );
    if (!res.ok) return { ok: false, reason: `Shopify Admin API ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
