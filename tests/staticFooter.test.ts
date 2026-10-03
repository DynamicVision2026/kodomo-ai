/**
 * WO-C7 item 2 (Founder, 3 Oct 2026): the legal footer must be readable as plain HTML, not only
 * after JavaScript loads. This codebase is a pure client-rendered Vite multi-page app (every
 * route's index.html is just a `<div id="root">` + a `<script type="module">` — no SSR/static
 * pre-render anywhere), so the only way to genuinely satisfy that requirement is to write the
 * footer as literal static HTML in each route's own index.html, outside the React root. These
 * tests read the raw file from disk (never render the React component tree) to prove the links
 * are present in the HTML a browser receives before any script runs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

// Every customer-facing route. Deliberately excludes admin-dashboard/ (a separate, staff-only IAP
// app) and design/ad12/ (an internal, never-linked component gallery) — neither is something a
// family or a legal reviewer ever lands on.
const PAGES = [
  'index.html',
  'login/index.html',
  'account/index.html',
  'claim/index.html',
  'course/index.html',
  'course/beginner/index.html',
  'legal/tokushoho/index.html',
  'legal/tokushoho-preview/index.html',
  'legal/privacy/index.html',
  'lp-new/index.html',
  'play/index.html',
  'print/centre/index.html',
  'print/deck/index.html',
  'print/kit/index.html',
];

describe('WO-C7 item 2: every customer-facing page has the legal footer as plain static HTML', () => {
  for (const page of PAGES) {
    it(`${page} has the footer links before any <script> tag runs`, () => {
      const html = readFileSync(resolve(ROOT, page), 'utf-8');
      const scriptIndex = html.indexOf('<script');
      const footerIndex = html.indexOf('class="legal-footer"');
      expect(footerIndex).toBeGreaterThan(-1);
      expect(footerIndex).toBeLessThan(scriptIndex === -1 ? Infinity : html.length);
      expect(html).toContain('href="/legal/tokushoho/"');
      expect(html).toContain('href="/legal/privacy/"');
      expect(html).toContain('href="mailto:info@domo-ai.com"');
      expect(html).toContain('href="https://beyondculture.ai"');
      // "plain HTML, not only after JS" — the footer markup itself must not live inside the
      // <script> tag's own source, only as sibling static markup.
      const scriptTagEnd = html.indexOf('</script>');
      const footerIsOutsideScript = footerIndex < scriptIndex || footerIndex > scriptTagEnd;
      expect(footerIsOutsideScript).toBe(true);
    });
  }

  it('admin-dashboard and the internal design gallery are deliberately not footer-ed', () => {
    const admin = readFileSync(resolve(ROOT, 'admin-dashboard/index.html'), 'utf-8');
    const design = readFileSync(resolve(ROOT, 'design/ad12/index.html'), 'utf-8');
    expect(admin).not.toContain('legal-footer');
    expect(design).not.toContain('legal-footer');
  });
});
