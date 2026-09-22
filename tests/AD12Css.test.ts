import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * AD-12 §3 "Rejected — do not implement" + F8 (Chromebook performance): a static content scan
 * of every stylesheet under src/ad12/, rather than trying to assert computed styles through
 * jsdom (which has no real layout/paint engine — a rendered-style test could pass while the
 * actual CSS still contained a forbidden property). Cheap, exact, and it catches a regression
 * the moment the forbidden text is typed, not just when someone remembers to look.
 */
const AD12_DIR = resolve(__dirname, '../src/ad12');

function allCss(): { file: string; content: string }[] {
  const out: { file: string; content: string }[] = [];
  (function walk(d: string) {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith('.css')) out.push({ file: p, content: readFileSync(p, 'utf8') });
    }
  })(AD12_DIR);
  return out;
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/perspective\s*:/i, '3D perspective/tilt'],
  [/rotate[xy]\s*\(/i, '3D rotateX/rotateY (tilt)'],
  [/backdrop-filter/i, 'backdrop-filter (F8: Chromebook performance)'],
  [/\bblur\s*\(/i, 'blur() (F8: Chromebook performance)'],
  [/confetti/i, 'confetti'],
];

describe('AD-12 F8/§3 — no forbidden CSS techniques anywhere under src/ad12/', () => {
  const files = allCss();

  it('found at least one stylesheet to scan (sanity check the scan itself works)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)('no stylesheet uses %s (%s)', (pattern) => {
    for (const { file, content } of files) {
      expect(pattern.test(content), `${file} matched ${pattern}`).toBe(false);
    }
  });

  it('only animates transform/opacity/box-shadow/background-color/color/flex-grow (F8: no layout-thrashing properties transitioned)', () => {
    const allowedInTransition = /^(transform|opacity|box-shadow|background-color|color|flex-grow)$/;
    for (const { file, content } of files) {
      // (?<![\w-]) excludes a custom property NAME that merely ends in "transition" (e.g.
      // --ad12-t-transition: 700ms;) — only a real `transition`/`transition-property`
      // declaration keyword should match, never a token whose name happens to contain the word.
      const matches = content.matchAll(/(?<![\w-])transition(?:-property)?\s*:\s*([^;]+);/g);
      for (const m of matches) {
        const props = m[1]!.split(',').map((s) => s.trim().split(/\s+/)[0]!);
        for (const prop of props) {
          if (prop === 'all' || /^var\(/.test(prop)) continue; // duration vars, not property names
          expect(allowedInTransition.test(prop), `${file}: transitions "${prop}"`).toBe(true);
        }
      }
    }
  });
});
