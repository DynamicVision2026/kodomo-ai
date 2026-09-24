import type { Env } from '../src/types.js';
import { createDb } from './dbStore.js';
import { FakeEmailSender, LoggingEmailSender, type EmailSender } from '../src/email.js';
import { PostmarkEmailSender } from './postmarkEmail.js';

/** Secrets required to start at all — a Cloud Run revision missing one of these, or still
 *  carrying an unfilled placeholder, must never accept traffic. `EMAIL_API_KEY` is deliberately
 *  NOT required: it's a launch blocker (no Postmark/SES account exists yet — see the launch
 *  blockers list), and the service falls back to `LoggingEmailSender` rather than refusing to
 *  start, so every other route stays testable/deployable ahead of that account existing. */
export const REQUIRED_SECRET_NAMES = ['ADMIN_TOKEN', 'SHOPIFY_WEBHOOK_SECRET', 'AUTH_PEPPER'] as const;

const PLACEHOLDER_PATTERN = /placeholder|change[_-]?me|\bTODO\b|\bTBD\b|<[^>]*>|\byour[_-]?(secret|token|key)\b|\bexample\b/i;

function assertNotPlaceholder(name: string, value: string): void {
  if (PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(
      `${name} looks like an unfilled placeholder value, not a real secret — refusing to start ` +
      'with it. Set the real value (see docs/launch-runbook.md).',
    );
  }
}

function buildEmailSender(): EmailSender {
  if (process.env.EMAIL_API_KEY && process.env.EMAIL_FROM) {
    // EMAIL_FROM_NAME/EMAIL_REPLY_TO are both optional (e.g. display name 「ナゼホリ」, reply-to
    // info@domo-ai.com) — PostmarkEmailSender falls back to a bare `From` address and no
    // `ReplyTo` field when either is unset, unchanged from before these existed.
    return new PostmarkEmailSender(
      process.env.EMAIL_API_KEY,
      process.env.EMAIL_FROM,
      process.env.EMAIL_FROM_NAME,
      process.env.EMAIL_REPLY_TO,
    );
  }
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    // Deployed but no email account configured yet — log instead of silently dropping OTPs, and
    // never crash the whole service over a still-pending launch blocker.
    console.warn('[buildEnv] EMAIL_API_KEY/EMAIL_FROM not set — emails will only be logged, never actually sent.');
    return new LoggingEmailSender();
  }
  return new FakeEmailSender();
}

/** Fails fast at startup — see the old KV-era version of this file for the same rationale
 *  (a missing/placeholder required secret should crash the container before it accepts traffic,
 *  not 500 or accept a forged webhook on the first real request). */
export function buildEnv(): Env {
  const missing = REQUIRED_SECRET_NAMES.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env var(s): ${missing.join(', ')}. Set them directly, or via ` +
      '`gcloud run deploy --set-secrets=...` (see docs/launch-runbook.md).',
    );
  }
  for (const name of REQUIRED_SECRET_NAMES) assertNotPlaceholder(name, process.env[name]!);
  if (process.env.SHOPIFY_ADMIN_API_TOKEN) {
    assertNotPlaceholder('SHOPIFY_ADMIN_API_TOKEN', process.env.SHOPIFY_ADMIN_API_TOKEN);
  }

  let variantIds: Record<string, string> | undefined;
  if (process.env.SHOPIFY_VARIANT_IDS) {
    try {
      variantIds = JSON.parse(process.env.SHOPIFY_VARIANT_IDS) as Record<string, string>;
    } catch {
      console.warn('[buildEnv] SHOPIFY_VARIANT_IDS is not valid JSON — ignoring it');
    }
  }

  // Architect decision: APP_ORIGINS is a comma-separated allowlist (never a wildcard) — e.g.
  // "https://kodomo-ai-421702481956.asia-northeast1.run.app,https://domo-ai.com" once the custom
  // domain is live. Absent entirely until this service's own env vars are updated to the new
  // scheme — `passesCsrfCheck` falls back to the deprecated single-origin APP_ORIGIN below in
  // that case, so a not-yet-migrated deployment keeps working unchanged.
  const originsRaw = process.env.APP_ORIGINS;
  const appOrigins = originsRaw
    ? originsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    db: createDb(),
    email: buildEmailSender(),
    SHOPIFY_WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET!,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN!,
    AUTH_PEPPER: process.env.AUTH_PEPPER!,
    APP_ORIGIN: process.env.APP_ORIGIN,
    APP_ORIGINS: appOrigins,
    APP_BASE_URL: process.env.APP_BASE_URL,
    SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN,
    SHOPIFY_ADMIN_API_TOKEN: process.env.SHOPIFY_ADMIN_API_TOKEN,
    SHOPIFY_VARIANT_IDS: variantIds,
    IAP_AUDIENCE: process.env.IAP_AUDIENCE,
  };
}
