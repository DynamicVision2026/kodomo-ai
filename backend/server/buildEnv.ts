import type { Env } from '../src/types.js';
import { createKvStore } from './kvStore.js';

/** The secret names this backend actually needs — passed to loadMissingSecrets() in index.ts
 *  before this runs. (ANTHROPIC_API_KEY/DEEPSEEK_API_KEY are NOT here: those belong to the
 *  content pipeline, a separate CLI tool under pipeline/, never this HTTP service.) */
export const REQUIRED_SECRET_NAMES = ['ADMIN_TOKEN', 'SHOPIFY_WEBHOOK_SECRET'] as const;

/**
 * Fails fast at startup rather than per-request: a Cloud Run revision that's missing a
 * required secret should never accept traffic in the first place. Throwing here crashes the
 * container before it starts listening, which Cloud Run surfaces as a failed revision — an
 * operator sees it immediately in `gcloud run services describe` / the console, instead of it
 * silently 500ing on the first real webhook.
 */
export function buildEnv(): Env {
  const missing = REQUIRED_SECRET_NAMES.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env var(s): ${missing.join(', ')}. Set them directly, or via ` +
      '`gcloud run deploy --set-secrets=...` (see docs/launch-runbook.md).',
    );
  }

  return {
    NAZE_CODES: createKvStore(),
    SHOPIFY_WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET!,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN!,
    SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN,
    SHOPIFY_ADMIN_API_TOKEN: process.env.SHOPIFY_ADMIN_API_TOKEN,
  };
}
