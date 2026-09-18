import { describe, it, expect } from 'vitest';
import {
  hostnameAllowed,
  extractJsonArray,
  validateDraftClaims,
  SOURCE_WHITELIST,
} from '../pipeline/01_research';

describe('01_research: hostnameAllowed', () => {
  it('allows an exact whitelisted domain and its subdomains', () => {
    expect(hostnameAllowed('https://www.britannica.com/science/yeast')).toBe(true);
    expect(hostnameAllowed('https://www.mext.go.jp/some/page')).toBe(true); // go.jp suffix
    expect(hostnameAllowed('https://kids.gakken.co.jp/pan')).toBe(true);
  });

  it('rejects anything off the whitelist', () => {
    expect(hostnameAllowed('https://en.wikipedia.org/wiki/Yeast')).toBe(false);
    expect(hostnameAllowed('https://evil-go.jp.attacker.com/')).toBe(false); // suffix trick
    expect(hostnameAllowed('not a url')).toBe(false);
  });

  it('the whitelist itself has not silently changed shape', () => {
    expect(SOURCE_WHITELIST).toContain('go.jp');
    expect(SOURCE_WHITELIST).toContain('britannica.com');
  });
});

describe('01_research: extractJsonArray', () => {
  it('extracts a bare JSON array', () => {
    expect(extractJsonArray('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('extracts a JSON array surrounded by prose or markdown fences', () => {
    const text = 'Here you go:\n```json\n[{"a":1},{"a":2}]\n```\nHope that helps!';
    expect(extractJsonArray(text)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('throws with the offending text when no array is present', () => {
    expect(() => extractJsonArray('no json here')).toThrow(/No JSON array/);
  });
});

const validClaim = () => ({
  statement: 'Yeast is a living microorganism.',
  sourceUrl: 'https://www.britannica.com/science/yeast',
  excerpt: 'Yeast are eukaryotic, single-celled microorganisms classified as members of the fungus kingdom.',
  adultLevelSource: true,
});

describe('01_research: validateDraftClaims', () => {
  it('accepts 4-6 well-formed claims', () => {
    const claims = Array.from({ length: 4 }, validClaim);
    expect(validateDraftClaims(claims)).toHaveLength(4);
  });

  it('rejects fewer than 4 or more than 6 claims', () => {
    expect(() => validateDraftClaims(Array.from({ length: 3 }, validClaim))).toThrow(/expected 4-6/);
    expect(() => validateDraftClaims(Array.from({ length: 7 }, validClaim))).toThrow(/expected 4-6/);
  });

  it('rejects a claim whose source is off the whitelist', () => {
    const bad = [...Array.from({ length: 3 }, validClaim), { ...validClaim(), sourceUrl: 'https://random-blog.example/x' }];
    expect(() => validateDraftClaims(bad)).toThrow(/not on the source whitelist/);
  });

  it('rejects a claim without adultLevelSource', () => {
    const bad = [...Array.from({ length: 3 }, validClaim), { ...validClaim(), adultLevelSource: false }];
    expect(() => validateDraftClaims(bad)).toThrow(/adultLevelSource must be true/);
  });

  it('rejects a claim with a missing or too-short excerpt', () => {
    const bad = [...Array.from({ length: 3 }, validClaim), { ...validClaim(), excerpt: 'x' }];
    expect(() => validateDraftClaims(bad)).toThrow(/excerpt missing or too short/);
  });

  it('rejects a claim with no statement', () => {
    const bad = [...Array.from({ length: 3 }, validClaim), { ...validClaim(), statement: '' }];
    expect(() => validateDraftClaims(bad)).toThrow(/missing statement/);
  });
});
