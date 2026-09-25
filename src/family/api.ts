import type { ModuleProgressState } from '../../shared/progressMerge';

/** Architect decision (same-origin API via reverse proxy, post-incident): a FIXED relative path
 *  (`/api/v1`, Dockerfile.frontend), never a cross-origin backend URL — the frontend Cloud Run
 *  service itself reverse-proxies `/api/*` to the backend server-side
 *  (backend/server/frontendIndex.ts), so the browser only ever calls its own origin. Undefined in
 *  local dev/every test (no backend/proxy running there) — same honest not-configured fallback
 *  the old /play/unlock screen used for VITE_UNLOCK_API_URL, and the same signal
 *  `isFamilyApiConfigured()` below reads to decide whether a real network call can be trusted at
 *  all. Before this migration this held the backend's own absolute, cross-origin URL — CORS and
 *  session-cookie isolation between that origin and the frontend's own were exactly the failure
 *  a real production incident exposed; a relative path has no origin of its own to mismatch. */
const API_BASE_URL: string | undefined = import.meta.env.VITE_FAMILY_API_URL;

export type ApiFailure = { ok: false; reason: 'not_configured' | 'network' | 'server' | string };

/** Exported for `src/course/api.ts` to reuse verbatim (WO-C1: "reuse... the shared infrastructure
 *  [including] family account" rather than a second copy of this same-origin-proxy/failure-shape
 *  logic) — the course's own API calls go through the identical `/api/v1` reverse-proxied base and
 *  the identical `ApiFailure` sentinel, just against course-specific paths. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response | ApiFailure> {
  if (!API_BASE_URL) return { ok: false, reason: 'not_configured' };
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** `apiFetch` returns either a genuine `fetch()` Response (whatever its status — including a
 *  real 4xx/5xx, which also has `ok: false`) or this module's own `ApiFailure` sentinel for the
 *  two cases where no request was even attempted. Checking `'ok' in res && res.ok === false`
 *  would wrongly match BOTH — a real Response's `.ok` is `false` for any non-2xx status too — so
 *  a genuine server refusal (401/403/...) would be misread as "never attempted" and its actual
 *  status/body lost. `reason` is the one field only the sentinel ever carries — a real (or
 *  test-mocked) Response never has it — so it's the unambiguous discriminator, and (unlike
 *  `instanceof Response`) still works against a plain `{ ok, json }` fetch mock, not just a real
 *  `Response` instance. */
export function isFailure(res: Response | ApiFailure): res is ApiFailure {
  return 'reason' in res;
}

/** AD-16 §6: whether a real backend is configured at all — the one thing that decides whether
 *  `openUnit` below can be trusted to answer authoritatively. `false` in local dev/every test
 *  (VITE_FAMILY_API_URL is never set there) — callers fall back to their own pre-AD16 local-only
 *  check in that case, same honest not-yet-configured convention as every other feature here. */
export function isFamilyApiConfigured(): boolean {
  return !!API_BASE_URL;
}

export interface MeResponse {
  familyId: string;
  email: string;
  entitlements: { moduleId: string; status: string; grantedAt: string }[];
  profiles: { id: string; avatarId: string; nicknameId: string; stage: number }[];
  /** AD-16 §5: per-module trial state — absent/empty for a family with no trial history for a
   *  given module yet. */
  trials: { moduleId: string; state: 'not_started' | 'active' | 'expired'; endsAt: string | null }[];
  /** WO-C1 §1: true when this family is in `config/course.allowFamilies`. The course tile's own
   *  visibility rule is `import.meta.env.VITE_COURSE_ENABLED === '1' || me.courseAllowed`. */
  courseAllowed: boolean;
}

export async function requestLoginCode(email: string): Promise<{ ok: true } | ApiFailure> {
  const res = await apiFetch('/auth/request', { method: 'POST', body: JSON.stringify({ email }) });
  if (isFailure(res)) return res;
  if (!res.ok) return { ok: false, reason: 'server' };
  return { ok: true };
}

export async function verifyLoginCode(email: string, code: string): Promise<{ ok: true; me: MeResponse } | ApiFailure> {
  const res = await apiFetch('/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
  if (isFailure(res)) return res;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'server' }));
    return { ok: false, reason: body.error ?? 'server' };
  }
  return { ok: true, me: (await res.json()) as MeResponse };
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST', body: '{}' });
}

export async function fetchMe(): Promise<MeResponse | null> {
  const res = await apiFetch('/me', { method: 'GET' });
  if (isFailure(res) || !res.ok) return null;
  return (await res.json()) as MeResponse;
}

export async function createProfile(avatarId: string, nicknameId: string, stage: number): Promise<{ id: string } | ApiFailure> {
  const res = await apiFetch('/profiles', { method: 'POST', body: JSON.stringify({ avatarId, nicknameId, stage }) });
  if (isFailure(res)) return res;
  if (!res.ok) return { ok: false, reason: 'server' };
  return (await res.json()) as { id: string };
}

export async function deleteProfile(profileId: string): Promise<void> {
  await apiFetch(`/profiles/${profileId}`, { method: 'DELETE' });
}

export async function getProgress(profileId: string, moduleId: string): Promise<ModuleProgressState | null> {
  const res = await apiFetch(`/profiles/${profileId}/progress/${moduleId}`, { method: 'GET' });
  if (isFailure(res) || !res.ok) return null;
  return (await res.json()) as ModuleProgressState;
}

export async function putProgress(profileId: string, moduleId: string, state: ModuleProgressState): Promise<ModuleProgressState | null> {
  const res = await apiFetch(`/profiles/${profileId}/progress/${moduleId}`, { method: 'PUT', body: JSON.stringify(state) });
  if (isFailure(res) || !res.ok) return null;
  return (await res.json()) as ModuleProgressState;
}

export interface ImportBody {
  importId: string;
  moduleId: string;
  guestProfile?: { avatarId: string; nicknameId: string; stage: number };
  progress: ModuleProgressState;
  targetProfileId?: string;
}

export async function importGuestProfile(body: ImportBody): Promise<{ profileId: string } | ApiFailure> {
  const res = await apiFetch('/import', { method: 'POST', body: JSON.stringify(body) });
  if (isFailure(res)) return res;
  if (!res.ok) return { ok: false, reason: 'server' };
  return (await res.json()) as { profileId: string };
}

export interface SessionInfo {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await apiFetch('/sessions', { method: 'GET' });
  if (isFailure(res) || !res.ok) return [];
  return (await res.json()) as SessionInfo[];
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`/sessions/${id}`, { method: 'DELETE' });
}

export async function requestEmailChange(newEmail: string): Promise<{ ok: true } | ApiFailure> {
  const res = await apiFetch('/account/email', { method: 'POST', body: JSON.stringify({ newEmail }) });
  if (isFailure(res)) return res;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'server' }));
    return { ok: false, reason: body.error ?? 'server' };
  }
  return { ok: true };
}

export async function confirmEmailChange(newEmail: string, code: string): Promise<{ ok: true } | ApiFailure> {
  const res = await apiFetch('/account/email', { method: 'POST', body: JSON.stringify({ newEmail, code }) });
  if (isFailure(res)) return res;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'server' }));
    return { ok: false, reason: body.error ?? 'server' };
  }
  return { ok: true };
}

export async function deleteAccount(code: string): Promise<{ ok: true } | ApiFailure> {
  const res = await apiFetch('/account', { method: 'DELETE', body: JSON.stringify({ code }) });
  if (isFailure(res)) return res;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'server' }));
    return { ok: false, reason: body.error ?? 'server' };
  }
  return { ok: true };
}

/** AD-16 §1: creates a purchase-intent bound server-side to THIS session's own family (never a
 *  client-asserted `family_id`) and returns the Shopify cart permalink to send the browser to —
 *  carrying only the intent token, never the purchaser's email or any family identifier. Requires
 *  a session; the caller (a logged-in parent's own purchase CTA) is the only place this is ever
 *  called from. */
export async function createPurchaseIntent(moduleId: string): Promise<{ ok: true; url: string } | ApiFailure> {
  const res = await apiFetch('/purchase-intents', { method: 'POST', body: JSON.stringify({ moduleId }) });
  if (isFailure(res)) return res;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'server' }));
    return { ok: false, reason: res.status === 503 ? 'not_configured' : (body.error ?? 'server') };
  }
  const body = (await res.json()) as { url: string };
  return { ok: true, url: body.url };
}

export type UnitOpenReason = 'trial_expired' | 'not_entitled' | 'unauthorized' | 'not_found' | 'not_configured' | 'network' | 'server';

/** AD-16 §6: the ONE call that decides whether `unitId` (a mission id) may actually be entered —
 *  never a client-side guess. Also the one place a module's own trial clock lazily starts (for
 *  its free/trial unit) and the one place first-paid-use evidence is recorded (for anything
 *  else) — both purely server-side side effects of a successful call, nothing the caller needs
 *  to do differently either way. */
export async function openUnit(profileId: string, moduleId: string, unitId: string): Promise<{ ok: true } | { ok: false; reason: UnitOpenReason }> {
  const res = await apiFetch(`/units/${encodeURIComponent(unitId)}/open`, {
    method: 'POST',
    body: JSON.stringify({ profileId, moduleId }),
  });
  if (isFailure(res)) {
    return { ok: false, reason: res.reason === 'not_configured' ? 'not_configured' : res.reason === 'network' ? 'network' : 'server' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, reason: 'unauthorized' };
  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (res.status === 403) {
    const body = await res.json().catch(() => null);
    if (body?.error === 'trial_expired' || body?.error === 'not_entitled') return { ok: false, reason: body.error };
    return { ok: false, reason: 'unauthorized' }; // CSRF-forbidden or an unrecognized reason — fail closed
  }
  return { ok: false, reason: 'server' };
}

/** AD-16 §2: the claim screen's own two calls — GET to show what the order is for, POST to
 *  actually bind it to the caller's own logged-in session family. Both require a session; neither
 *  ever accepts or sends a client-asserted family id. */
export interface ClaimInfo {
  orderName: string;
  moduleIds: string[];
}

export async function getClaim(token: string): Promise<{ ok: true; claim: ClaimInfo } | ApiFailure> {
  const res = await apiFetch(`/claims/${encodeURIComponent(token)}`, { method: 'GET' });
  if (isFailure(res)) return res;
  if (!res.ok) return { ok: false, reason: res.status === 401 ? 'unauthorized' : res.status === 404 ? 'not_found' : 'server' };
  return { ok: true, claim: (await res.json()) as ClaimInfo };
}

export async function confirmClaim(token: string): Promise<{ ok: true; orderName: string } | ApiFailure> {
  const res = await apiFetch(`/claims/${encodeURIComponent(token)}`, { method: 'POST', body: '{}' });
  if (isFailure(res)) return res;
  if (!res.ok) {
    return { ok: false, reason: res.status === 401 ? 'unauthorized' : res.status === 410 ? 'invalid_or_expired' : 'server' };
  }
  const body = (await res.json()) as { orderName: string };
  return { ok: true, orderName: body.orderName };
}
