import { describe, it, expect } from 'vitest';
import { resolveArchetype } from '../src/engine/resolver';
import type { SlotAssemblyPhase } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';

const phase = mission.phases[0] as unknown as SlotAssemblyPhase;

describe('archetype resolver', () => {
  it('matches on tags, not card ids', () => {
    expect(resolveArchetype(phase, { what: 'w2' }).key).toBe('CLEAR');
    expect(resolveArchetype(phase, { what: 'w3' }).key).toBe('OFFTOPIC');
    expect(resolveArchetype(phase, { what: 'w1' }).key).toBe('VAGUE');
  });
  it('throws when nothing matches, so missions must carry a catch-all', () => {
    expect(() => resolveArchetype(phase, {})).toThrow();
  });
});
