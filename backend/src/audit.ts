import type { Env } from './types.js';
import type { AuditLogDoc } from './schema.js';
import { auditLogCollection, auditLogPath } from './schema.js';
import { randomToken } from './util.js';

/**
 * AD-16 §8: one append-only entry per binding/refund/staff-write event. No endpoint ever updates
 * or deletes one (there is no `updateAuditLog`/`deleteAuditLog` export from this module at all —
 * the absence is the guarantee, not a rule enforced elsewhere). `actor` is a staff email, or
 * `system:webhook` / `system:api` for anything the backend itself did with no staff involved;
 * `reason` is required for a staff-initiated write and null for a system one.
 */
export async function writeAuditLog(
  env: Env,
  entry: { actor: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; reason?: string | null },
): Promise<void> {
  const doc: AuditLogDoc = {
    at: new Date().toISOString(),
    actor: entry.actor,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    before: entry.before,
    after: entry.after,
    reason: entry.reason ?? null,
  };
  await env.db.set(auditLogPath(randomToken(12)), doc);
}

export async function listAuditLogForTarget(env: Env, targetId: string) {
  const all = await env.db.list<AuditLogDoc>(auditLogCollection());
  return all.filter((e) => e.data.targetId === targetId).sort((a, b) => b.data.at.localeCompare(a.data.at));
}

/** AD-16 §8: "audit log ... filterable by order, family or staff" — the staff (actor) half of
 *  that requirement, alongside `listAuditLogForTarget`'s order/family half. */
export async function listAuditLogForActor(env: Env, actor: string) {
  const all = await env.db.list<AuditLogDoc>(auditLogCollection());
  return all.filter((e) => e.data.actor === actor).sort((a, b) => b.data.at.localeCompare(a.data.at));
}
