import type { Env } from './types.js';
import type { StaffDoc, StaffRole } from './schema.js';
import { staffPath } from './schema.js';
import { verifyIapJwt } from './iap.js';

export interface StaffIdentity {
  email: string;
  role: StaffRole;
}

/**
 * AD-16 §8: verifies the IAP JWT, then resolves the verified email against the `staff/{email}`
 * Firestore allowlist. A verified-by-Google identity with no allowlist entry is still refused —
 * IAP proves WHO is asking, `staff/` decides whether they may use this dashboard at all.
 */
export async function resolveStaffIdentity(request: Request, env: Env): Promise<StaffIdentity | null> {
  if (!env.IAP_AUDIENCE) return null;
  const jwt = request.headers.get('x-goog-iap-jwt-assertion');
  if (!jwt) return null;

  const identity = await verifyIapJwt(jwt, env.IAP_AUDIENCE);
  if (!identity) return null;

  const staffDoc = await env.db.get<StaffDoc>(staffPath(identity.email));
  if (!staffDoc) return null;

  return { email: identity.email, role: staffDoc.role };
}

export function canWrite(staff: StaffIdentity): boolean {
  return staff.role === 'operator';
}
