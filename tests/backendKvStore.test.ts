/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@google-cloud/firestore', () => {
  class Firestore {
    constructor(public opts: { projectId: string }) {}
  }
  return { Firestore };
});

const { createKvStore } = await import('../backend/server/kvStore');
const { FirestoreKv } = await import('../backend/server/firestoreKv');
const { MemoryKv } = await import('../backend/server/memoryKv');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.FIRESTORE_PROJECT_ID;
  delete process.env.FIRESTORE_COLLECTION;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('createKvStore', () => {
  it('falls back to MemoryKv with a warning when no GCP project is configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kv = createKvStore();
    expect(kv).toBeInstanceOf(MemoryKv);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('in-memory KV store'));
    warnSpy.mockRestore();
  });

  it('uses FirestoreKv when GOOGLE_CLOUD_PROJECT is set (the real Cloud Run case)', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'my-gcp-project';
    const kv = createKvStore();
    expect(kv).toBeInstanceOf(FirestoreKv);
  });

  it('also accepts FIRESTORE_PROJECT_ID for local opt-in', () => {
    process.env.FIRESTORE_PROJECT_ID = 'my-dev-project';
    const kv = createKvStore();
    expect(kv).toBeInstanceOf(FirestoreKv);
  });

  it('GOOGLE_CLOUD_PROJECT takes precedence when both are set', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'cloud-run-project';
    process.env.FIRESTORE_PROJECT_ID = 'ignored-project';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createKvStore();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('cloud-run-project'));
    logSpy.mockRestore();
  });
});
