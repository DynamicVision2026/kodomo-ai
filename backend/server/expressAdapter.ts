import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

/**
 * Node has global Request/Response/Headers (undici) since Node 18 — this lets
 * backend/src/router.ts stay exactly the Web-standard `(Request) => Promise<Response>` shape
 * it always was, with no Cloudflare-specific module convention anywhere. This file is the
 * only new "glue" the platform switch required.
 */
export function toFetchRequest(req: ExpressRequest): Request {
  const url = `${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  // express.raw() (mounted in index.ts) puts the exact, unparsed request bytes on req.body as
  // a Buffer — critical for the Shopify webhook's HMAC check, which must verify against the
  // literal bytes Shopify sent, never a re-serialized JSON.stringify of a parsed object.
  const body =
    hasBody && Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : undefined;

  return new Request(url, {
    method: req.method,
    headers,
    // A Uint8Array (which Buffer extends) is a spec-valid Fetch request body at runtime. The
    // `any` cast (rather than `as BodyInit`) is deliberate: this file is typechecked under two
    // different tsconfigs — tsconfig.server.json (no DOM lib, so the global `BodyInit` name
    // doesn't even exist there) and, transitively via tests/*.test.ts, the repo's root DOM-lib
    // config (where `BodyInit` exists but @types/node's newer generic
    // `Uint8Array<ArrayBufferLike>` doesn't structurally match it). `any` sidesteps both
    // without referencing a type name that only one of the two configs has.
    body: body as any,
  });
}

export async function sendFetchResponse(res: ExpressResponse, fetchRes: Response): Promise<void> {
  res.status(fetchRes.status);
  fetchRes.headers.forEach((value, key) => {
    // Node sets its own transfer-encoding/content-length; letting the Fetch Response's through
    // verbatim can conflict with what Express/Node actually sends. `set-cookie` is handled
    // separately below — the undici Headers class exempts it from `forEach`'s otherwise-joined
    // value (per the Fetch spec's own "set-cookie" carve-out), so it never appears here at all.
    if (key.toLowerCase() === 'content-length' || key.toLowerCase() === 'transfer-encoding') return;
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  // AD-13 §1: a session cookie response — a plain `setHeader('set-cookie', ...)` would silently
  // keep only the LAST call if this were ever more than one cookie; `getSetCookie()` (Node's own
  // undici Headers, spec-aligned) returns each Set-Cookie value separately, and `res.append` adds
  // each as its own header line rather than overwriting.
  for (const cookie of fetchRes.headers.getSetCookie?.() ?? []) {
    res.append('set-cookie', cookie);
  }
  const body = await fetchRes.text();
  res.send(body);
}
