import type { KVNamespaceLike } from '../src/types.js';

/**
 * In-process, single-instance, non-durable. Local dev only — see kvStore.ts for why this is
 * never the right choice for a deployed Cloud Run service. Deliberately NOT exported for use
 * anywhere except createKvStore()'s explicit fallback.
 */
export class MemoryKv implements KVNamespaceLike {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}
