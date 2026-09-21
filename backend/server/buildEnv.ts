import type { Env } from '../src/types.js';
import { createKvStore } from './kvStore.js';

/** The secret names this backend actually needs — passed to loadMissingSecrets() in index.ts
 *  before this runs. (ANTHROPIC_API_KEY/DEEPSEEK_API_KEY are NOT here: those belong to the
 *  content pipeline, a separate CLI tool under pipeline/, never this HTTP service.) */
export const REQUIRED_SECRET_NAMES = ['ADMIN_TOKEN', 'SHOPIFY_WEBHOOK_SECRET'] as const;

/**
 * WO-30 §10: catches exactly the literal placeholder text docs/launch-runbook.md's own setup
 * commands use as a stand-in before the real value is filled in — e.g.
 * `echo -n "<placeholder for now>" | gcloud secrets create shopify-webhook-secret ...` (Part 1
 * step 2, real value added later from Part 3 step 2) or `<a long random string YOU generate>`.
 * A secret genuinely left at that literal copy-pasted text would otherwise pass the plain
 * "is it set" check below and accept traffic with a webhook signature or admin token nobody
 * real could ever produce. Deliberately pattern-based, not a length/entropy check — a short
 * but genuine local-dev value (this file's own tests use 'test-admin') must keep working; only
 * unmistakable placeholder wording is rejected. */
const PLACEHOLDER_PATTERN = /placeholder|change[_-]?me|\bTODO\b|\bTBD\b|<[^>]*>|\byour[_-]?(secret|token|key)\b|\bexample\b/i;

function assertNotPlaceholder(name: string, value: string): void {
  if (PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(
      `${name} looks like an unfilled placeholder value, not a real secret — refusing to start ` +
      'with it. Set the real value (see docs/launch-runbook.md Part 1 step 2 / Part 3 step 2).',
    );
  }
}

/**
 * Fails fast at startup rather than per-request: a Cloud Run revision that's missing a
 * required secret — or still carries an unfilled placeholder one — should never accept traffic
 * in the first place. Throwing here crashes the container before it starts listening, which
 * Cloud Run surfaces as a failed revision — an operator sees it immediately in
 * `gcloud run services describe` / the console, instead of it silently 500ing (or worse,
 * accepting a forged webhook nobody could ever produce the real signature for) on the first
 * real request.
 */
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

  return {
    NAZE_CODES: createKvStore(),
    SHOPIFY_WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET!,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN!,
    SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN,
    SHOPIFY_ADMIN_API_TOKEN: process.env.SHOPIFY_ADMIN_API_TOKEN,
  };
}
