import type { KVNamespaceLike } from '../src/types.js';
import { FirestoreKv } from './firestoreKv.js';
import { MemoryKv } from './memoryKv.js';

/**
 * Cloud Run has no persistent local disk or memory across restarts or instances (unlike a
 * single long-lived process) — an in-memory store here is only ever correct for local dev.
 * Firestore is used whenever a GCP project is known (i.e. actually running on Cloud Run, or a
 * developer opted in locally via FIRESTORE_PROJECT_ID).
 */
export function createKvStore(): KVNamespaceLike {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIRESTORE_PROJECT_ID;
  if (projectId) {
    const collection = process.env.FIRESTORE_COLLECTION ?? 'naze_kv';
    console.log(`[kvStore] Using Firestore (project ${projectId}, collection "${collection}")`);
    return new FirestoreKv(projectId, collection);
  }

  console.warn(
    '[kvStore] No GOOGLE_CLOUD_PROJECT/FIRESTORE_PROJECT_ID set — falling back to an ' +
    'in-memory KV store. Issued codes will NOT survive a restart and will NOT be shared ' +
    'across instances. This is fine for local dev only — never for a deployed Cloud Run ' +
    'service, which is both ephemeral and can run more than one instance.',
  );
  return new MemoryKv();
}
