import express from 'express';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

const PORT = Number(process.env.PORT) || 8080;

/**
 * Architect decision (post-incident, replacing the two-hostname/cross-origin-CORS architecture
 * a real production incident exposed): this is now the ONE server the `kodomo-ai` Cloud Run
 * service runs — it serves the Vite production build (dist/, unchanged from what `serve` used
 * to serve — every real route's own index.html, multi-page, never a SPA rewrite) AND
 * reverse-proxies `/api/*` to the backend Cloud Run service server-side, so the browser only
 * ever talks to ONE origin. Two runtime env vars, both absent — and therefore both no-ops — in
 * local dev/every test:
 *  - CANONICAL_HOST: the ONE public hostname this service answers as itself; any OTHER Host
 *    header gets a 301 to it (path + query preserved) — "any other Host" includes the OTHER
 *    default Cloud Run URL this same service is also reachable at, which is exactly the
 *    CORS/session-isolation gap the real incident this replaces was rooted in. Cloud Run's own
 *    revision-TAG hostnames (containing `---`, e.g. `candidate-124---kodomo-ai-<hash>.a.run.app`)
 *    are deliberately exempt — CI's own smoke test hits the CANDIDATE revision directly, before
 *    promotion, and must never be bounced to whatever is currently live on the canonical host.
 *  - BACKEND_URL: the backend Cloud Run service's own live URL — resolved at deploy time
 *    (.github/workflows/ci.yml), never baked into the client bundle (that was the OLD,
 *    cross-origin architecture; VITE_FAMILY_API_URL is now a fixed relative `/api/v1`, see
 *    Dockerfile.frontend).
 */
const CANONICAL_HOST = process.env.CANONICAL_HOST;
const BACKEND_URL = process.env.BACKEND_URL;
const DIST_DIR = path.resolve(process.cwd(), 'dist');

/** Cloud Run reserves `---` as the tag/service-name separator in its own generated revision-tag
 *  URLs — never a real, public-facing hostname a family could organically land on, so it's a
 *  reliable, principled way to exempt CI's own pre-promotion smoke-test URL from the canonical
 *  redirect without a denylist that could drift. */
export function isRevisionTagHost(host: string): boolean {
  return host.includes('---');
}

export function canonicalRedirect(req: ExpressRequest, res: ExpressResponse, next: () => void): void {
  const host = req.hostname;
  if (!CANONICAL_HOST || host === CANONICAL_HOST || isRevisionTagHost(host)) {
    next();
    return;
  }
  res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
}

/** Same conversion this codebase's own backend/server/expressAdapter.ts already uses to bridge
 *  Express <-> the Web-standard fetch() Request/Response this proxy is built on — kept local
 *  (not imported) since this file's own request/response shapes differ just enough (streaming
 *  the backend's response straight through rather than building one via router.ts) that sharing
 *  the exact same two functions would mean threading assumptions neither file actually needs. */
export async function proxyToBackend(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  if (!BACKEND_URL) {
    res.status(503).send('backend not configured');
    return;
  }
  const target = `${BACKEND_URL}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === 'host') continue; // let fetch address BACKEND_URL's own host
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody && Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : undefined;

  try {
    const backendRes = await fetch(target, { method: req.method, headers, body: body as any, redirect: 'manual' });
    res.status(backendRes.status);
    backendRes.headers.forEach((value, key) => {
      if (['content-length', 'transfer-encoding', 'set-cookie'].includes(key.toLowerCase())) return;
      res.setHeader(key, value);
    });
    // The backend's own __Host-nz_session cookie must pass through byte-for-byte — getSetCookie()
    // (Node's spec-aligned undici Headers) returns each Set-Cookie value separately; res.append
    // adds each as its own header line rather than overwriting (same reasoning as
    // backend/server/expressAdapter.ts's own sendFetchResponse).
    for (const cookie of backendRes.headers.getSetCookie?.() ?? []) {
      res.append('set-cookie', cookie);
    }
    const buf = Buffer.from(await backendRes.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('[frontend] proxy error', err);
    res.status(502).send('bad gateway');
  }
}

/** Builds the app without starting it listening — the part tests exercise directly (via
 *  supertest-style requests against the returned app) without opening a real port. */
export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));

  app.use(canonicalRedirect);

  // Mirrors backend/server/index.ts's own express.raw() mount: the exact, unparsed request
  // bytes, never a re-serialized JSON.stringify of a parsed object — critical for anything the
  // backend itself verifies byte-for-byte (this proxy has no such route today, but re-parsing
  // and re-serializing a JSON body it doesn't need to touch is both unnecessary work and a way
  // to silently normalize away something the backend would have seen differently).
  app.use('/api', express.raw({ type: '*/*', limit: '1mb' }));
  app.use('/api', proxyToBackend);

  // Static build — every real route's own index.html (multi-page, no SPA rewrite; see this
  // file's own header comment and Dockerfile.frontend's matching one for why that flag must
  // never be added here).
  app.use(express.static(DIST_DIR, { extensions: ['html'] }));

  return app;
}

function main(): void {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[frontend] listening on :${PORT}`);
  });
}

// Only start listening when this file is run directly (production/dev) — never as a side effect
// of a test importing it for createApp()/canonicalRedirect()/proxyToBackend()/isRevisionTagHost().
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
