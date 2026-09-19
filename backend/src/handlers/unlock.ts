import type { Env } from '../types.js';
import { isWellFormedCode, normalizeCode } from '../codes.js';
import { getIssuedCode, putIssuedCode } from '../store.js';

export interface UnlockRequestBody {
  code: string;
  /** A client-generated, non-PII device id (spec v0.5 §7: no accounts, no cross-device sync —
   *  this only counts activations, it never identifies a person). */
  deviceId: string;
}

export interface UnlockResponseBody {
  moduleIds: string[];
  founder: boolean;
  /** True once this code has more than maxDevices distinct devices. Spec v0.5 §7: "soft cap" —
   *  informational only. Redemption always succeeds; this is a signal for the founder to
   *  notice unusually wide sharing, never a denial. */
  overCap: boolean;
}

/** POST /unlock — the counterpart of /play/unlock's client-side redemption screen. */
export async function handleUnlock(request: Request, env: Env): Promise<Response> {
  let body: UnlockRequestBody;
  try {
    body = (await request.json()) as UnlockRequestBody;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  if (!body.deviceId) return new Response('deviceId is required', { status: 400 });

  const code = normalizeCode(body.code ?? '');
  if (!isWellFormedCode(code)) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const record = await getIssuedCode(env, code);
  if (!record) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!record.devices.includes(body.deviceId)) {
    record.devices = [...record.devices, body.deviceId];
    await putIssuedCode(env, record);
  }

  const response: UnlockResponseBody = {
    moduleIds: record.moduleIds,
    founder: record.founder,
    overCap: record.devices.length > record.maxDevices,
  };
  return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
}
