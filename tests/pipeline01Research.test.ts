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

const validPracticeClaim = () => ({
  statement: 'Families commonly rinse rice before cooking it, even though few can say why.',
  type: 'practice' as const,
});

describe('01_research: validateDraftClaims — fact/practice (WO-11 decision 6, reconciled WO-11C)', () => {
  it('accepts a practice claim with no sourceUrl, excerpt, or adultLevelSource at all', () => {
    const claims = [...Array.from({ length: 3 }, validClaim), validPracticeClaim()];
    const result = validateDraftClaims(claims);
    expect(result).toHaveLength(4);
    expect(result[3]).toMatchObject({ type: 'practice', sourceUrl: '', excerpt: '' });
  });

  it('a claim with no type at all still defaults to "fact" and still requires the full evidentiary path', () => {
    // validClaim() carries no `type` field — confirms the default branch, not just an explicit "fact".
    const bad = [...Array.from({ length: 3 }, validClaim), { statement: 'Untyped claim.', sourceUrl: '', excerpt: '', adultLevelSource: false }];
    expect(() => validateDraftClaims(bad)).toThrow(/missing sourceUrl/);
  });

  it('an explicit "fact" claim is not relaxed by the practice branch — still requires sourceUrl/excerpt/adultLevelSource', () => {
    const bad = [
      ...Array.from({ length: 3 }, validClaim),
      { statement: 'A fact with no evidence.', type: 'fact' as const, sourceUrl: '', excerpt: '', adultLevelSource: false },
    ];
    expect(() => validateDraftClaims(bad)).toThrow(/missing sourceUrl/);
  });

  it('rejects an unrecognised type value', () => {
    const bad = [...Array.from({ length: 3 }, validClaim), { ...validPracticeClaim(), type: 'opinion' as unknown as 'practice' }];
    expect(() => validateDraftClaims(bad)).toThrow(/type must be "fact" or "practice"/);
  });

  it('a practice claim that DOES name a sourceUrl still has to be on the real whitelist — not exempt, just not mandatory', () => {
    const bad = [...Array.from({ length: 3 }, validClaim), { ...validPracticeClaim(), sourceUrl: 'https://random-blog.example/x' }];
    expect(() => validateDraftClaims(bad)).toThrow(/not on the source whitelist/);
  });

  it('a mixed fact+practice batch still enforces the fact claim\'s evidence even though a practice claim in the same batch has none', () => {
    const bad = [
      ...Array.from({ length: 2 }, validClaim),
      { ...validClaim(), sourceUrl: '' }, // a fact claim missing its source
      validPracticeClaim(),
    ];
    expect(() => validateDraftClaims(bad)).toThrow(/missing sourceUrl/);
  });
});
