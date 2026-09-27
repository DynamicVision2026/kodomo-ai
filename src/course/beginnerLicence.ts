import type { MeResponse } from './api';

/**
 * WO-C5 §6: "the course needs the family licence, and existing 'Module 1' licences count." The
 * beginner course's own entitlement check is exactly `isModuleEntitled(familyId, 'm1')` restated
 * client-side against `/me`'s own entitlements list — the SAME SKU/moduleId (`kodomo-ai-m1`)
 * already used for the Playground, so a family that bought it before this course even existed is
 * licensed for the beginner course too, with zero new Shopify/webhook code.
 */
export function isBeginnerCourseLicensed(me: MeResponse): boolean {
  return me.entitlements.some((e) => e.moduleId === 'm1' && e.status === 'active');
}
