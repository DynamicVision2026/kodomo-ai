import { Firestore } from '@google-cloud/firestore';
import type { KVNamespaceLike } from '../src/types.js';

/**
 * Firestore-backed KVNamespaceLike. One document per key, holding `{ value, updatedAt }` —
 * `value` is always the same JSON string backend/src/store.ts would have handed a Cloudflare
 * KV namespace, so nothing above this adapter (store.ts, the handlers, the isolation logic)
 * changed at all to support this.
 *
 * Uses Application Default Credentials — on Cloud Run that's the service's own runtime
 * identity, no key file needed. Locally, `gcloud auth application-default login` first.
 */
export class FirestoreKv implements KVNamespaceLike {
  private readonly db: Firestore;
  private readonly collection: string;

  constructor(projectId: string, collection: string) {
    this.db = new Firestore({ projectId });
    this.collection = collection;
  }

  /** Firestore document ids may not contain '/'; this repo's own key shapes (`code:...`,
   *  `order:...`) never do, but this guards against a future key shape that might. */
  private docId(key: string): string {
    return key.replace(/\//g, '_');
  }

  async get(key: string): Promise<string | null> {
    const snap = await this.db.collection(this.collection).doc(this.docId(key)).get();
    if (!snap.exists) return null;
    const data = snap.data() as { value?: string } | undefined;
    return data?.value ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    await this.db
      .collection(this.collection)
      .doc(this.docId(key))
      .set({ value, updatedAt: new Date().toISOString() });
  }

  async delete(key: string): Promise<void> {
    await this.db.collection(this.collection).doc(this.docId(key)).delete();
  }
}
