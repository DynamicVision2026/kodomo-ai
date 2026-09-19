/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fakes @google-cloud/firestore with an in-memory doc store, so FirestoreKv's own logic (key
// -> doc id mapping, the `value` field convention, exists-check) is tested without any real
// GCP project/credentials.
const docs = new Map<string, { value: string; updatedAt: string }>();

vi.mock('@google-cloud/firestore', () => {
  class FakeDocRef {
    constructor(private id: string) {}
    async get() {
      const data = docs.get(this.id);
      return { exists: data !== undefined, data: () => data };
    }
    async set(data: { value: string; updatedAt: string }) {
      docs.set(this.id, data);
    }
    async delete() {
      docs.delete(this.id);
    }
  }
  class FakeCollectionRef {
    doc(id: string) {
      return new FakeDocRef(id);
    }
  }
  class Firestore {
    collection(_name: string) {
      return new FakeCollectionRef();
    }
  }
  return { Firestore };
});

const { FirestoreKv } = await import('../backend/server/firestoreKv');

beforeEach(() => docs.clear());

describe('FirestoreKv', () => {
  it('returns null for a key that was never written', async () => {
    const kv = new FirestoreKv('test-project', 'naze_kv');
    expect(await kv.get('code:NAZE-ABCD-EFGH')).toBeNull();
  });

  it('round-trips a value through put/get', async () => {
    const kv = new FirestoreKv('test-project', 'naze_kv');
    await kv.put('code:NAZE-ABCD-EFGH', '{"moduleIds":["m1"]}');
    expect(await kv.get('code:NAZE-ABCD-EFGH')).toBe('{"moduleIds":["m1"]}');
  });

  it('overwrites on a second put to the same key', async () => {
    const kv = new FirestoreKv('test-project', 'naze_kv');
    await kv.put('order:123', '["NAZE-AAAA-AAAA"]');
    await kv.put('order:123', '["NAZE-AAAA-AAAA","NAZE-BBBB-BBBB"]');
    expect(await kv.get('order:123')).toBe('["NAZE-AAAA-AAAA","NAZE-BBBB-BBBB"]');
  });

  it('delete removes the key', async () => {
    const kv = new FirestoreKv('test-project', 'naze_kv');
    await kv.put('code:NAZE-ABCD-EFGH', 'x');
    await kv.delete('code:NAZE-ABCD-EFGH');
    expect(await kv.get('code:NAZE-ABCD-EFGH')).toBeNull();
  });

  it('sanitizes a "/" in the key so it stays a valid Firestore document id', async () => {
    const kv = new FirestoreKv('test-project', 'naze_kv');
    await kv.put('weird/key', 'value');
    expect(docs.has('weird_key')).toBe(true);
    expect(await kv.get('weird/key')).toBe('value');
  });
});
