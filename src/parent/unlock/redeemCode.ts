/**
 * Client side of the backend's POST /unlock (backend/src/handlers/unlock.ts, deployed to
 * Cloud Run). Spec v0.5 §7: "Shopify order -> email with a family code -> /play/unlock ->
 * backend + persistent store."
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
 * `apiBaseUrl` is undefined until the backend is actually deployed and its URL configured
 * (import.meta.env.VITE_UNLOCK_API_URL) — `not_configured` is a distinct, honest failure
 * mode from `network`, so the UI can say "this isn't live yet" rather than "check your
 * connection".
 */
export async function redeemFamilyCode(
  apiBaseUrl: string | undefined,
  code: string,
  deviceId: string,
): Promise<RedeemResult> {
  if (!apiBaseUrl) return { ok: false, reason: 'not_configured' };

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/unlock`, {
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
