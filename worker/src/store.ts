import type { Env, IssuedCode } from './types';

const codeKey = (code: string) => `code:${code}`;
const orderKey = (orderId: number | string) => `order:${orderId}`;

export async function getIssuedCode(env: Env, code: string): Promise<IssuedCode | null> {
  const raw = await env.NAZE_CODES.get(codeKey(code));
  return raw ? (JSON.parse(raw) as IssuedCode) : null;
}

export async function putIssuedCode(env: Env, record: IssuedCode): Promise<void> {
  await env.NAZE_CODES.put(codeKey(record.code), JSON.stringify(record));
}

/** Codes already issued for a given Shopify order, oldest first. Empty if none yet. */
export async function getCodesForOrder(env: Env, orderId: number | string): Promise<string[]> {
  const raw = await env.NAZE_CODES.get(orderKey(orderId));
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function addCodeToOrderIndex(env: Env, orderId: number | string, code: string): Promise<void> {
  const existing = await getCodesForOrder(env, orderId);
  await env.NAZE_CODES.put(orderKey(orderId), JSON.stringify([...existing, code]));
}
