/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { generateFamilyCode, isWellFormedCode, normalizeCode } from '../worker/src/codes';

describe('generateFamilyCode', () => {
  it('produces NAZE-XXXX-XXXX using only the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateFamilyCode();
      expect(code).toMatch(/^NAZE-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(code).not.toMatch(/[0O1IL]/); // excluded: easy to mis-hear/mis-type
      expect(isWellFormedCode(code)).toBe(true);
    }
  });

  it('is different on every call (no fixed seed, no collisions in a small sample)', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateFamilyCode()));
    expect(codes.size).toBe(200);
  });
});

describe('isWellFormedCode', () => {
  it('rejects the wrong shape', () => {
    expect(isWellFormedCode('NAZE-ABCD-EFGH')).toBe(true);
    expect(isWellFormedCode('naze-abcd-efgh')).toBe(false); // case-sensitive by design
    expect(isWellFormedCode('NAZE-ABC-EFGH')).toBe(false);
    expect(isWellFormedCode('NAZE-ABCD-EFGH-IJKL')).toBe(false);
    expect(isWellFormedCode('SHOP-ABCD-EFGH')).toBe(false);
    expect(isWellFormedCode('')).toBe(false);
  });

  it('rejects the excluded letters even in an otherwise well-shaped code', () => {
    expect(isWellFormedCode('NAZE-0000-0000')).toBe(false);
    expect(isWellFormedCode('NAZE-OOOO-IIII')).toBe(false);
  });
});

describe('normalizeCode', () => {
  it('trims whitespace and upper-cases, so a pasted/hand-typed code still matches', () => {
    expect(normalizeCode('  naze-abcd-efgh  ')).toBe('NAZE-ABCD-EFGH');
  });
});
