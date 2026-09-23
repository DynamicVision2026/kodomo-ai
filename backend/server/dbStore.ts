import type { Db } from '../src/db.js';
import { FirestoreDb } from './firestoreDb.js';
import { MemoryDb } from './memoryDb.js';

/**
 * Same rule as the old createKvStore(): Cloud Run has no durable local disk and can run more
 * than one instance, so an in-memory Db is only ever correct for local dev.
 */
export function createDb(): Db {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIRESTORE_PROJECT_ID;
  if (projectId) {
    console.log(`[dbStore] Using Firestore (project ${projectId})`);
    return new FirestoreDb(projectId);
  }

  console.warn(
    '[dbStore] No GOOGLE_CLOUD_PROJECT/FIRESTORE_PROJECT_ID set — falling back to an in-memory ' +
    'Db. Families, sessions and progress will NOT survive a restart and will NOT be shared ' +
    'across instances. This is fine for local dev only — never for a deployed Cloud Run service.',
  );
  return new MemoryDb();
}
