import { Firestore } from '@google-cloud/firestore';
import type { Db, DbDoc, DbTx } from '../src/db.js';

/**
 * Real Firestore-backed `Db` — every path (`families/f1`, `families/f1/profiles/p1`, ...) is a
 * genuine Firestore document path, passed straight to `Firestore#doc()`; unlike the old
 * FirestoreKv this needs no key-sanitizing (AD-13 §2's own path shapes never contain a bare `/`
 * inside a single id). Uses Application Default Credentials, same as before — the Cloud Run
 * service's own runtime identity, no key file.
 */
export class FirestoreDb implements Db {
  private readonly db: Firestore;

  constructor(projectId: string) {
    this.db = new Firestore({ projectId });
  }

  async get<T>(path: string): Promise<T | null> {
    const snap = await this.db.doc(path).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async set<T>(path: string, value: T): Promise<void> {
    // `T` is always a plain JSON-serializable doc shape (schema.ts) — Firestore's own
    // `DocumentData` typing adds nothing checkable here, so this is a deliberate `any`, same
    // spirit as expressAdapter.ts's own cross-typing cast.
    await this.db.doc(path).set(value as any);
  }

  async delete(path: string): Promise<void> {
    await this.db.doc(path).delete();
  }

  async list<T>(collectionPath: string): Promise<DbDoc<T>[]> {
    const snap = await this.db.collection(collectionPath).get();
    return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as T }));
  }

  async query<T>(collectionPath: string, field: string, value: unknown): Promise<DbDoc<T>[]> {
    const snap = await this.db.collection(collectionPath).where(field, '==', value).get();
    return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as T }));
  }

  async runTransaction<R>(fn: (tx: DbTx) => Promise<R>): Promise<R> {
    return this.db.runTransaction(async (fsTx) => {
      const tx: DbTx = {
        get: async <T,>(path: string) => {
          const snap = await fsTx.get(this.db.doc(path));
          return snap.exists ? (snap.data() as T) : null;
        },
        set: <T,>(path: string, value: T) => {
          fsTx.set(this.db.doc(path), value as any);
        },
        delete: (path: string) => {
          fsTx.delete(this.db.doc(path));
        },
      };
      return fn(tx);
    });
  }
}
