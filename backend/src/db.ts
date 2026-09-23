/**
 * Structural Firestore-shaped document store — this ticket's counterpart of the old
 * `KVNamespaceLike` (backend/src/types.ts), which only ever supported a flat string-keyed blob
 * and could not express a family's nested collections, a query, or a transaction. AD-13 §1:
 * "Firestore is accessed only by the backend through its service account" — nothing under
 * backend/src/ ever imports `@google-cloud/firestore` directly; only backend/server/firestoreDb.ts
 * does, exactly the same platform-neutral/platform-glue split store.ts and firestoreKv.ts already
 * established.
 *
 * Paths are real Firestore document paths (`families/f1`, `families/f1/profiles/p1`, ...) —
 * `backend/server/firestoreDb.ts` hands them straight to `Firestore#doc()`; `MemoryDb` (tests +
 * local dev) treats them as opaque map keys and derives "collection" listings from path prefixes.
 */
export interface DbDoc<T> {
  id: string;
  data: T;
}

/** Staged writes only — mirrors the real `Firestore.Transaction` API (`tx.set`/`tx.delete` queue
 *  a write, applied atomically when the callback returns; `tx.get` always sees the pre-transaction
 *  value, never a write staged earlier in the same transaction — same as real Firestore). */
export interface DbTx {
  get<T>(path: string): Promise<T | null>;
  set<T>(path: string, data: T): void;
  delete(path: string): void;
}

export interface Db {
  get<T>(path: string): Promise<T | null>;
  set<T>(path: string, data: T): Promise<void>;
  delete(path: string): Promise<void>;
  /** Every doc directly under `collectionPath` (one level deep only). */
  list<T>(collectionPath: string): Promise<DbDoc<T>[]>;
  /** Equality filter only — the one query shape this ticket's admin lookups need
   *  (`emailIndex` reverse lookups aside, which use the deterministic hash as the doc id
   *  instead). */
  query<T>(collectionPath: string, field: string, value: unknown): Promise<DbDoc<T>[]>;
  runTransaction<R>(fn: (tx: DbTx) => Promise<R>): Promise<R>;
}
