import express from 'express';
import { handleRequest } from '../src/router.js';
import { buildEnv, REQUIRED_SECRET_NAMES } from './buildEnv.js';
import { loadMissingSecrets } from './secrets.js';
import { toFetchRequest, sendFetchResponse } from './expressAdapter.js';

const PORT = Number(process.env.PORT) || 8080;

async function main(): Promise<void> {
  await loadMissingSecrets([...REQUIRED_SECRET_NAMES, 'SHOPIFY_ADMIN_API_TOKEN']);
  const env = buildEnv(); // throws (and crashes the container) if a required secret is missing

  const app = express();
  app.disable('x-powered-by');
  app.use(express.raw({ type: '*/*', limit: '1mb' }));

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));

  // Catch-all: every other path/method goes through the same handleRequest() that used to
  // back the Cloudflare Worker's `fetch` export — all real routing lives there, keyed off
  // pathname/method, not here. Deliberately app.use(), not app.all('*', ...): Express 5's
  // path-to-regexp requires a named wildcard (e.g. '/*splat') for a bare '*' route; an
  // unparameterized middleware sidesteps that entirely and matches everything regardless.
  app.use(async (req, res) => {
    try {
      const fetchRes = await handleRequest(toFetchRequest(req), env);
      await sendFetchResponse(res, fetchRes);
    } catch (err) {
      console.error('[server] unhandled error', err);
      res.status(500).send('internal error');
    }
  });

  app.listen(PORT, () => {
    console.log(`[server] listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
