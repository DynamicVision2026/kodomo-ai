import { describe, it, expect } from 'vitest';
import { rootFormFor } from '../src/ad12/rootForm';

describe('AD-12 rootFormFor — the closed rootType -> static form mapping (F5)', () => {
  it('めあて -> upward', () => {
    expect(rootFormFor('めあて')).toBe('upward');
  });
  it('しくみ -> interlocking', () => {
    expect(rootFormFor('しくみ')).toBe('interlocking');
  });
  it('わかれ -> twoEqual', () => {
    expect(rootFormFor('わかれ')).toBe('twoEqual');
  });
  it('an unauthored/invalid rootType resolves to null, never a guess', () => {
    expect(rootFormFor('yontsu')).toBeNull();
    expect(rootFormFor(undefined)).toBeNull();
    expect(rootFormFor('')).toBeNull();
  });
});
