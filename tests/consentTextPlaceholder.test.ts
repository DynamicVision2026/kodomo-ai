import { describe, it, expect } from 'vitest';
import { CONSENT_TEXT_PARAGRAPHS, CONSENT_TEXT_PLACEHOLDER_MARKER } from '../src/legal/consentText';

describe('consent text C', () => {
  // Normal runs only note the placeholder; a RELEASE=1 run (the production gate convention used by
  // gate-course-review-approved) refuses to pass while the legally-approved wording is missing.
  it.runIf(process.env.RELEASE === '1')('is no longer the placeholder in a RELEASE=1 build', () => {
    expect(CONSENT_TEXT_PARAGRAPHS.some((p) => p.includes(CONSENT_TEXT_PLACEHOLDER_MARKER))).toBe(false);
  });

  it('is non-empty', () => {
    expect(CONSENT_TEXT_PARAGRAPHS.length).toBeGreaterThan(0);
  });
});
