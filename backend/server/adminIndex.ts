import express from 'express';
import path from 'node:path';
import { handleAdminApi } from '../src/adminRouter.js';
import { buildEnv, REQUIRED_SECRET_NAMES } from './buildEnv.js';
import { loadMissingSecrets } from './secrets.js';
import { toFetchRequest, sendFetchResponse } from './expressAdapter.js';

/**
 * AD-16 §8: the `kodomo-ai-admin` Cloud Run service — same codebase, same `Env`/domain functions
 * as the public backend (`backend/server/index.ts`), but a DIFFERENT entry point serving BOTH the
 * admin dashboard's own static UI (`dist-admin/admin-dashboard`, built separately by
 * `vite.admin.config.ts` — never part of the public frontend's own `dist/`) and
 * `handleAdminApi` (IAP-verified staff routes) from the same origin. Deploy this file as its own
 * Cloud Run service (`gcloud run deploy kodomo-ai-admin ...`, Dockerfile.admin) with
 * Identity-Aware Proxy enabled in front of it — nothing here is ever reachable from the public
 * frontend/backend's own origin, and nothing admin-related ships in either of those.
 */
const PORT = Number(process.env.PORT) || 8080;
// Built by `npm run build:admin` (vite.admin.config.ts) — see Dockerfile.admin for how this
// directory ends up alongside the compiled server in the deployed image.
const ADMIN_STATIC_DIR = path.join(process.cwd(), 'dist-admin', 'admin-dashboard');

async function main(): Promise<void> {
  await loadMissingSecrets([...REQUIRED_SECRET_NAMES, 'SHOPIFY_ADMIN_API_TOKEN', 'EMAIL_API_KEY']);
  const env = buildEnv();

  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));

  // The dashboard's own static UI — everything at `/admin-api/*` below is the only other
  // surface this service exposes, so a plain `express.static` (no SPA catch-all rewrite needed:
  // src/admin/nav.ts's own navigation is entirely query-param-driven, one real HTML page) is
  // enough for every asset AND for `/` itself (its default `index: 'index.html'` behavior).
  app.use(express.static(ADMIN_STATIC_DIR));

  app.use(express.raw({ type: '*/*', limit: '1mb' }));
  app.use('/admin-api', async (req, res) => {
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
