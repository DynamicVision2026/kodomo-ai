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
}

/** Work order §1 "firstPaidUseAt (yes/no, time, which lesson)" — a per-family-per-MODULE fact
 *  (`UsageDoc` lives at `families/{id}/usage/{moduleId}`, never per profile: whichever child in
 *  the household opens a paid lesson first sets it for the whole module), never duplicated
 *  identically across every profile row the way an earlier version of this API did. */
export interface FamilyModuleUsage {
  moduleId: string;
  used: boolean;
  firstPaidUseAt: string | null;
  firstPaidUnitId: string | null;
}

export interface FamilyDetail {
  familyId: string;
  email: string;
  createdAt: string;
  status: 'active' | 'deleted';
  profiles: FamilyProfileSummary[];
  trials: { moduleId: string; startedAt: string; endsAt: string; convertedAt: string | null; convertedOrderId: string | null }[];
  entitlements: { moduleId: string; status: EntitlementStatus; shopifyOrderId: string; grantedAt: string; revokedAt: string | null }[];
  usage: FamilyModuleUsage[];
  orders: OrderDoc[];
  sessions: { id: string; label: string; lastSeenAt: string }[];
}

export async function fetchFamily(familyId: string): Promise<ApiResult<FamilyDetail>> {
  return asResult<FamilyDetail>(await adminFetch(`/families/${encodeURIComponent(familyId)}`));
}

export async function resendWelcome(familyId: string, reason: string): Promise<ApiResult<null>> {
  return asResult<null>(await adminFetch(`/families/${encodeURIComponent(familyId)}/resend-welcome`, {
    method: 'POST', body: JSON.stringify({ reason }),
  }));
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

/** GET /orders/{id} returns the raw `OrderDoc` plus two server-computed fields OrderView.tsx
 *  itself never derives: the line-item total, and a direct link to the order in Shopify admin
 *  (null when SHOPIFY_SHOP_DOMAIN isn't configured — see backend/src/links.ts). */
export interface AdminOrderDetail extends OrderDoc {
  amountTotal: number;
  shopifyAdminUrl: string | null;
}

export async function fetchOrder(orderId: string): Promise<ApiResult<AdminOrderDetail>> {
  return asResult<AdminOrderDetail>(await adminFetch(`/orders/${encodeURIComponent(orderId)}`));
}

export async function bindOrder(orderId: string, familyId: string, reason: string): Promise<ApiResult<OrderDoc>> {
  return asResult(await adminFetch(`/orders/${encodeURIComponent(orderId)}/bind`, {
    method: 'POST', body: JSON.stringify({ familyId, reason }),
  }));
}

export async function resendClaim(orderId: string, reason: string): Promise<ApiResult<null>> {
  return asResult<null>(await adminFetch(`/orders/${encodeURIComponent(orderId)}/resend-claim`, {
    method: 'POST', body: JSON.stringify({ reason }),
  }));
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

export async function fetchAuditLog(filter: { targetId: string } | { actor: string }): Promise<ApiResult<AuditLogDoc[]>> {
  const param = 'targetId' in filter ? `targetId=${encodeURIComponent(filter.targetId)}` : `actor=${encodeURIComponent(filter.actor)}`;
  return asResult<AuditLogDoc[]>(await adminFetch(`/audit?${param}`));
}

export type { BindingMethod, BindingState, EntitlementState, RefundState, StaffRole };
