import type { Env } from './types.js';
import type { ProfileDoc } from './schema.js';
import { profilesCollection } from './schema.js';
import { getFamily, listEntitlements } from './family.js';

/** Never the full address over the wire to the client that's already authenticated as this
 *  family — `/me` is read by ordinary page JS, and there's no reason it needs the whole string.
 *  Keeps the first character and the domain: "p***@example.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return email;
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

export interface MeResponse {
  familyId: string;
  email: string;
  entitlements: { moduleId: string; status: string }[];
  profiles: { id: string; avatarId: string; nicknameId: string; stage: number }[];
}

export async function buildMeResponse(env: Env, familyId: string): Promise<MeResponse | null> {
  const family = await getFamily(env, familyId);
  if (!family || family.status !== 'active') return null;

  const entitlements = await listEntitlements(env, familyId);
  const profiles = await env.db.list<ProfileDoc>(profilesCollection(familyId));

  return {
    familyId,
    email: maskEmail(family.email),
    entitlements: entitlements.map((e) => ({ moduleId: e.id, status: e.data.status })),
    profiles: profiles
      .filter((p) => !p.data.deletedAt)
      .map((p) => ({ id: p.id, avatarId: p.data.avatarId, nicknameId: p.data.nicknameId, stage: p.data.stage })),
  };
}

/** A coarse, human-readable device label for session-eviction emails and the account page's
 *  device list (AD-13 §2 `sessions.label`, e.g. "iPad · Safari") — not meant to be a precise
 *  device fingerprint, just enough for a parent to recognize which device is which. */
export function deviceLabelFromUserAgent(userAgent: string | null): string {
  const ua = userAgent ?? '';
  let platform = 'この端末';
  if (/iPad/.test(ua)) platform = 'iPad';
  else if (/iPhone/.test(ua)) platform = 'iPhone';
  else if (/Android/.test(ua)) platform = 'Android';
  else if (/Macintosh/.test(ua)) platform = 'Mac';
  else if (/Windows/.test(ua)) platform = 'Windows';

  let browser = '';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  return browser ? `${platform} · ${browser}` : platform;
}
