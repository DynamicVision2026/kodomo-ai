import type { Db, DbDoc, DbTx } from '../src/db.js';

/**
 * In-process, single-instance, non-durable — same role as the old MemoryKv: local dev without a
 * GCP project, and every unit test. `runTransaction` stages writes and applies them only once the
 * callback resolves (matching real Firestore's semantics — see db.ts's own doc comment) but,
 * being single-threaded and non-durable, does not model cross-transaction write conflicts; no
 * test in this repo depends on that (concurrency safety is Firestore's own guarantee once
 * deployed, not something a fake needs to re-prove).
 */
export class MemoryDb implements Db {
  private readonly data = new Map<string, unknown>();

  async get<T>(path: string): Promise<T | null> {
    return this.data.has(path) ? (this.data.get(path) as T) : null;
  }

  async set<T>(path: string, value: T): Promise<void> {
    this.data.set(path, value);
  }

  async delete(path: string): Promise<void> {
    this.data.delete(path);
  }

  async list<T>(collectionPath: string): Promise<DbDoc<T>[]> {
    const prefix = `${collectionPath}/`;
    const out: DbDoc<T>[] = [];
    for (const [path, value] of this.data) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest.includes('/')) continue; // a nested sub-collection doc, not a direct child
      out.push({ id: rest, data: value as T });
    }
    return out;
  }

  async query<T>(collectionPath: string, field: string, value: unknown): Promise<DbDoc<T>[]> {
    const all = await this.list<T>(collectionPath);
    return all.filter((doc) => (doc.data as Record<string, unknown>)[field] === value);
  }

  async runTransaction<R>(fn: (tx: DbTx) => Promise<R>): Promise<R> {
    const writes: { type: 'set' | 'delete'; path: string; value?: unknown }[] = [];
    const tx: DbTx = {
      get: <T,>(path: string) => this.get<T>(path),
      set: <T,>(path: string, value: T) => {
        writes.push({ type: 'set', path, value });
      },
      delete: (path: string) => {
        writes.push({ type: 'delete', path });
      },
    };
    const result = await fn(tx);
    for (const write of writes) {
      if (write.type === 'set') this.data.set(write.path, write.value);
      else this.data.delete(write.path);
    }
    return result;
  }
}
