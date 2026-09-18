/**
 * Client side of the Worker's POST /unlock (worker/src/handlers/unlock.ts). Spec v0.5 §7:
 * "Shopify order -> email with a family code -> /play/unlock -> Worker + KV."
 */
export interface RedeemSuccess {
  ok: true;
  moduleIds: string[];
  founder: boolean;
  overCap: boolean;
}
export interface RedeemFailure {
  ok: false;
  reason: 'not_configured' | 'not_found' | 'network' | 'server';
}
export type RedeemResult = RedeemSuccess | RedeemFailure;

/**
 * `workerUrl` is undefined until the Worker is actually deployed and its URL configured
 * (import.meta.env.VITE_UNLOCK_API_URL) — `not_configured` is a distinct, honest failure
 * mode from `network`, so the UI can say "this isn't live yet" rather than "check your
 * connection".
 */
export async function redeemFamilyCode(
  workerUrl: string | undefined,
  code: string,
  deviceId: string,
): Promise<RedeemResult> {
  if (!workerUrl) return { ok: false, reason: 'not_configured' };

  let res: Response;
  try {
    res = await fetch(`${workerUrl}/unlock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, deviceId }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (!res.ok) return { ok: false, reason: 'server' };

  try {
    const body = (await res.json()) as { moduleIds: string[]; founder: boolean; overCap: boolean };
    return { ok: true, moduleIds: body.moduleIds, founder: body.founder, overCap: body.overCap };
  } catch {
    return { ok: false, reason: 'server' };
  }
}
