/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { MemoryKv } from '../backend/server/memoryKv';

describe('MemoryKv', () => {
  it('returns null for an unset key', async () => {
    expect(await new MemoryKv().get('nope')).toBeNull();
  });

  it('round-trips put/get and delete removes it', async () => {
    const kv = new MemoryKv();
    await kv.put('a', '1');
    expect(await kv.get('a')).toBe('1');
    await kv.delete('a');
    expect(await kv.get('a')).toBeNull();
  });

  it('two instances do not share state (matches Cloud Run\'s per-instance reality)', async () => {
    const a = new MemoryKv();
    const b = new MemoryKv();
    await a.put('k', 'only-in-a');
    expect(await b.get('k')).toBeNull();
  });
});
