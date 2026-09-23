import type { ModuleProgressState } from '../../shared/progressMerge';

/** Set once the backend (backend/src/ + backend/server/) is actually deployed behind the real
 *  custom domain (AD-13 §1) — undefined in every environment until then, same honest
 *  not-configured fallback the old /play/unlock screen used for VITE_UNLOCK_API_URL. */
const API_BASE_URL: string | undefined = import.meta.env.VITE_FAMILY_API_URL;

export type ApiFailure = { ok: false; reason: 'not_configured' | 'network' | 'server' | string };

async function apiFetch(path: string, init?: RequestInit): Promise<Response | ApiFailure> {
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

function isFailure(res: Response | ApiFailure): res is ApiFailure {
  return 'ok' in res && res.ok === false;
}

export interface MeResponse {
  familyId: string;
  email: string;
  entitlements: { moduleId: string; status: string }[];
  profiles: { id: string; avatarId: string; nicknameId: string; stage: number }[];
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
  if (!res.ok) return { ok: false, reason: 'server' };
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
