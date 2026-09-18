import { describe, it, expect } from 'vitest';
import { stripRuby, rubyCoverage } from '../pipeline/lib/ruby';

describe('ruby markup', () => {
  it('strips readings', () => {
    expect(stripRuby('{道|みち}を おしえて')).toBe('道を おしえて');
  });
  it('reports which characters carry ruby', () => {
    const { base, annotated } = rubyCoverage('{道|みち}と 山');
    expect(base).toBe('道と 山');
    expect(annotated.has('道')).toBe(true);
    expect(annotated.has('山')).toBe(false);
  });
});
