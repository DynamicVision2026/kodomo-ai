import { describe, it, expect } from 'vitest';
import { ROOT_TYPES, parseRootType } from '../scripts/lib/rootType';

describe('rootType (WO-11 decision 2, closed-set enforcement added WO-11C)', () => {
  it('ROOT_TYPES is exactly the three accepted values, no more no fewer', () => {
    expect(ROOT_TYPES).toEqual(['しくみ', 'めあて', 'わかれ']);
    expect(ROOT_TYPES).toHaveLength(3);
  });

  it('parseRootType accepts each of the three exactly', () => {
    expect(parseRootType('しくみ')).toBe('しくみ');
    expect(parseRootType('めあて')).toBe('めあて');
    expect(parseRootType('わかれ')).toBe('わかれ');
  });

  it('parseRootType rejects an arbitrary fourth value — adversarial proof', () => {
    expect(parseRootType('よそく')).toBeNull();
    expect(parseRootType('こたえ')).toBeNull();
    expect(parseRootType('ぎもん')).toBeNull();
  });

  it('parseRootType rejects romanized/English spellings — no cross-script coercion', () => {
    expect(parseRootType('shikumi')).toBeNull();
    expect(parseRootType('meate')).toBeNull();
    expect(parseRootType('wakare')).toBeNull();
    expect(parseRootType('mechanism')).toBeNull();
  });

  it('parseRootType rejects whitespace/case variants — no trimming or normalization', () => {
    expect(parseRootType('しくみ ')).toBeNull();
    expect(parseRootType(' しくみ')).toBeNull();
    expect(parseRootType('シクミ')).toBeNull(); // katakana, not the accepted hiragana literal
  });

  it('parseRootType rejects non-string and empty values', () => {
    expect(parseRootType(undefined)).toBeNull();
    expect(parseRootType(null)).toBeNull();
    expect(parseRootType('')).toBeNull();
    expect(parseRootType(0)).toBeNull();
    expect(parseRootType(['しくみ'])).toBeNull();
    expect(parseRootType({ value: 'しくみ' })).toBeNull();
  });
});
