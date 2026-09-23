import express from 'express';
import { handleAdminApi } from '../src/adminRouter.js';
import { buildEnv, REQUIRED_SECRET_NAMES } from './buildEnv.js';
import { loadMissingSecrets } from './secrets.js';
import { toFetchRequest, sendFetchResponse } from './expressAdapter.js';

/**
 * AD-16 §8: the `kodomo-ai-admin` Cloud Run service — same codebase, same `Env`/domain functions
 * as the public backend (`backend/server/index.ts`), but a DIFFERENT entry point exposing only
 * `handleAdminApi` (IAP-verified staff routes). Deploy this file as its own Cloud Run service
 * (`gcloud run deploy kodomo-ai-admin --set-env-vars=... ` pointing its start command at this
 * built file, e.g. via a second `package.json` script) with Identity-Aware Proxy enabled in
 * front of it — nothing here is ever reachable from the public frontend/backend's own origin.
 */
const PORT = Number(process.env.PORT) || 8080;

async function main(): Promise<void> {
  await loadMissingSecrets([...REQUIRED_SECRET_NAMES, 'SHOPIFY_ADMIN_API_TOKEN', 'EMAIL_API_KEY']);
  const env = buildEnv();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.raw({ type: '*/*', limit: '1mb' }));

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));

  app.use(async (req, res) => {
    try {
      const fetchRes = await handleAdminApi(toFetchRequest(req), env, new URL(toFetchRequest(req).url));
      await sendFetchResponse(res, fetchRes);
    } catch (err) {
      console.error('[admin-server] unhandled error', err);
      res.status(500).send('internal error');
    }
  });

  app.listen(PORT, () => {
    console.log(`[admin-server] listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('[admin-server] failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
