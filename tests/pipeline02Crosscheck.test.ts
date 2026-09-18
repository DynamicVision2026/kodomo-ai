import { describe, it, expect } from 'vitest';
import { normalize, htmlToText } from '../pipeline/02_crosscheck';

describe('02_crosscheck: normalize', () => {
  it('collapses whitespace and trims', () => {
    expect(normalize('  a\n\tb   c  ')).toBe('a b c');
  });
});

describe('02_crosscheck: htmlToText', () => {
  it('strips tags, scripts, and styles', () => {
    const html = '<html><head><style>.x{color:red}</style></head>' +
      '<body><script>evil()</script><p>Yeast is a <b>fungus</b>.</p></body></html>';
    expect(htmlToText(html)).not.toMatch(/evil|color:red/);
    expect(normalize(htmlToText(html))).toContain('Yeast is a fungus .');
  });

  it('decodes common HTML entities', () => {
    expect(htmlToText('Bread &amp; butter &mdash;'.replace('&mdash;', '&gt;'))).toContain('Bread & butter >');
    expect(htmlToText('&quot;yeast&quot; &#39;fungus&#39;')).toBe('"yeast" \'fungus\'');
  });
});
