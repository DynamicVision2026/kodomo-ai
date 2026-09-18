import type { Env, IssuedCode } from '../types';
import { generateFamilyCode } from '../codes';
import { putIssuedCode } from '../store';
import { timingSafeEqual } from '../util';

const MAX_DEVICES = 5;

export interface AdminIssueRequestBody {
  moduleIds: string[];
  founder?: boolean;
  note?: string;
}

/**
 * POST /admin/issue — manual code issuance outside the Shopify flow entirely: founder codes
 * (spec v0.5 §7: "Founder codes set founder: true"), support reissues, review copies. Never
 * touched by the webhook handler; a purchase always goes through handleShopifyOrderWebhook.
 */
export async function handleAdminIssue(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.ADMIN_TOKEN}`;
  if (!timingSafeEqual(auth, expected)) {
    return new Response('unauthorized', { status: 401 });
  }

  let body: AdminIssueRequestBody;
  try {
    body = (await request.json()) as AdminIssueRequestBody;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  if (!Array.isArray(body.moduleIds) || body.moduleIds.length === 0) {
    return new Response('moduleIds must be a non-empty array', { status: 400 });
  }

  const code = generateFamilyCode();
  const record: IssuedCode = {
    code,
    moduleIds: body.moduleIds,
    founder: body.founder ?? false,
    devices: [],
    maxDevices: MAX_DEVICES,
    issuedAt: new Date().toISOString(),
    note: body.note,
  };
  await putIssuedCode(env, record);

  return new Response(JSON.stringify({ code }), { status: 201, headers: { 'content-type': 'application/json' } });
}
