import type {
  AuditLogDoc, BindingMethod, BindingState, EntitlementState, EntitlementStatus,
  OrderDoc, RefundState, StaffRole,
} from '../../backend/src/schema';

/**
 * AD-16 §8: every call here is same-origin, relative to whatever serves this bundle
 * (backend/server/adminIndex.ts) — IAP sits in front of that ONE service and injects its own
 * verified-identity header server-side; this code never handles or stores a credential of its
 * own, the same way a normal browser session relies on a cookie it never touches directly.
 */
async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/admin-api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function asResult<T>(res: Response): Promise<ApiResult<T>> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, message: text || `HTTP ${res.status}` };
  }
  return { ok: true, data: (await res.json()) as T };
}

export interface Me {
  email: string;
  role: StaffRole;
}

export async function fetchMe(): Promise<ApiResult<Me>> {
  return asResult<Me>(await adminFetch('/me'));
}

export interface SearchResults {
  families: { familyId: string; email: string }[];
  orders: { shopifyOrderId: string; orderName: string }[];
}

export async function search(q: string): Promise<ApiResult<SearchResults>> {
  return asResult<SearchResults>(await adminFetch(`/search?q=${encodeURIComponent(q)}`));
}

export interface FamilyProfileSummary {
  id: string;
  avatarId: string;
  nicknameId: string;
  stage: number;
  progressSummary: { moduleId: string; unitsCompleted: number }[];
  firstPaidUseAt: string | null;
}

export interface FamilyDetail {
  familyId: string;
  email: string;
  createdAt: string;
  status: 'active' | 'deleted';
  profiles: FamilyProfileSummary[];
  trials: { moduleId: string; startedAt: string; endsAt: string; convertedAt: string | null; convertedOrderId: string | null }[];
  entitlements: { moduleId: string; status: EntitlementStatus; shopifyOrderId: string; grantedAt: string; revokedAt: string | null }[];
  orders: OrderDoc[];
  sessions: { id: string; label: string; lastSeenAt: string }[];
}

export async function fetchFamily(familyId: string): Promise<ApiResult<FamilyDetail>> {
  return asResult<FamilyDetail>(await adminFetch(`/families/${encodeURIComponent(familyId)}`));
}

export async function resendWelcome(familyId: string): Promise<ApiResult<null>> {
  return asResult<null>(await adminFetch(`/families/${encodeURIComponent(familyId)}/resend-welcome`, { method: 'POST' }));
}

export async function changeFamilyEmail(familyId: string, newEmail: string, reason: string): Promise<ApiResult<{ familyId: string; email: string }>> {
  return asResult(await adminFetch(`/families/${encodeURIComponent(familyId)}/email`, {
    method: 'POST', body: JSON.stringify({ newEmail, reason }),
  }));
}

export async function setEntitlement(
  familyId: string, moduleId: string, status: EntitlementStatus, reason: string,
): Promise<ApiResult<unknown>> {
  return asResult(await adminFetch(`/families/${encodeURIComponent(familyId)}/entitlements/${encodeURIComponent(moduleId)}`, {
    method: 'POST', body: JSON.stringify({ status, reason }),
  }));
}

export async function revokeAllSessions(familyId: string, reason: string): Promise<ApiResult<{ revoked: number }>> {
  return asResult(await adminFetch(`/families/${encodeURIComponent(familyId)}/sessions/revoke-all`, {
    method: 'POST', body: JSON.stringify({ reason }),
  }));
}

export async function fetchOrder(orderId: string): Promise<ApiResult<OrderDoc>> {
  return asResult<OrderDoc>(await adminFetch(`/orders/${encodeURIComponent(orderId)}`));
}

export async function bindOrder(orderId: string, familyId: string, reason: string): Promise<ApiResult<OrderDoc>> {
  return asResult(await adminFetch(`/orders/${encodeURIComponent(orderId)}/bind`, {
    method: 'POST', body: JSON.stringify({ familyId, reason }),
  }));
}

export async function resendClaim(orderId: string): Promise<ApiResult<null>> {
  return asResult<null>(await adminFetch(`/orders/${encodeURIComponent(orderId)}/resend-claim`, { method: 'POST' }));
}

export async function requestRefund(orderId: string, requestChannel: string, reason: string): Promise<ApiResult<OrderDoc>> {
  return asResult(await adminFetch(`/orders/${encodeURIComponent(orderId)}/refund-request`, {
    method: 'POST', body: JSON.stringify({ requestChannel, reason }),
  }));
}

export async function decideRefund(orderId: string, decision: 'approved' | 'declined', reason: string): Promise<ApiResult<OrderDoc>> {
  return asResult(await adminFetch(`/orders/${encodeURIComponent(orderId)}/refund-decision`, {
    method: 'POST', body: JSON.stringify({ decision, reason }),
  }));
}

export type QueueName = 'awaiting_claim' | 'needs_review' | 'duplicate' | 'refund_requests';

export async function fetchQueue(name: QueueName): Promise<ApiResult<OrderDoc[]>> {
  return asResult<OrderDoc[]>(await adminFetch(`/queues/${name}`));
}

export async function fetchAuditLog(targetId: string): Promise<ApiResult<AuditLogDoc[]>> {
  return asResult<AuditLogDoc[]>(await adminFetch(`/audit?targetId=${encodeURIComponent(targetId)}`));
}

export type { BindingMethod, BindingState, EntitlementState, RefundState, StaffRole };
