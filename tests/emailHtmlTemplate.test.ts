/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { loginCodeEmail, moduleActivatedEmail, claimYourPurchaseEmail } from '../backend/src/email';

/**
 * Email-redesign (Founder, 1 Oct 2026): the design-pack HTML body for the login-code and
 * activation/claim emails (items 1-6 of that work order). `text` stays the single source of
 * truth for the actual wording pins (tests/copy01Emails.test.ts) — this file only checks the
 * additive `html` field: email-safe shape (table layout, inline styles, literal hex colors, no
 * `var()`, no `<svg>`, no tracking pixel) and the specific button/code-box content each email
 * needs.
 */
describe('email-redesign — HTML bodies', () => {
  it('loginCodeEmail: has an html body with the code shown large, the hosted PNG (not an <svg>), and no tracking pixel', () => {
    const msg = loginCodeEmail('parent@example.com', '123456', 'https://domo-ai.com');
    expect(msg.html).toBeTruthy();
    const html = msg.html!;
    expect(html).toContain('123456');
    expect(html).toContain('https://domo-ai.com/email/hatena_question@2x.png');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('width="1" height="1"');
    expect(html).not.toMatch(/var\(--/);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('info@domo-ai.com');
    expect(html).toContain('https://domo-ai.com/legal/privacy/');
    // text (the pinned plain-text fallback) is untouched by the html addition.
    expect(msg.text).toBe('ログインコードは 123456 です。10分間有効です。\n\nこのメールに心当たりがない場合は、何も操作せずそのまま破棄してください。');
  });

  it('loginCodeEmail: html is optional and omitted when no appBaseUrl-deriving info is needed by callers that skip it', () => {
    const msg = loginCodeEmail('parent@example.com', '123456');
    // Still produced (default '' base) — image/privacy links are same-origin-relative instead.
    expect(msg.html).toContain('/email/hatena_question@2x.png');
    expect(msg.html).toContain('123456');
  });

  it('moduleActivatedEmail (beginnerLaunch=true): html replaces the raw link with a labeled button, text keeps the raw link', () => {
    const msg = moduleActivatedEmail('parent@example.com', 'https://domo-ai.com/login/?email=parent%40example.com&next=%2Fcourse%2Fbeginner%2F', true);
    expect(msg.html).toBeTruthy();
    const html = msg.html!;
    expect(html).toContain('学習を始める');
    expect(html).toContain('href="https://domo-ai.com/login/?email=parent%40example.com&amp;next=%2Fcourse%2Fbeginner%2F"');
    expect(html).toContain('#FFD23F');
    expect(html).toContain('https://domo-ai.com/email/hatena_question@2x.png');
    // text (pinned by tests/copy01Emails.test.ts) is untouched — it still shows the raw URL.
    expect(msg.text).toContain('https://domo-ai.com/login/?email=parent%40example.com&next=%2Fcourse%2Fbeginner%2F');
  });

  it('moduleActivatedEmail (beginnerLaunch=false): no html — out of this work order\'s scope', () => {
    const msg = moduleActivatedEmail('parent@example.com', 'https://example.com/login/', false);
    expect(msg.html).toBeUndefined();
  });

  it('claimYourPurchaseEmail (beginnerLaunch=true): html carries the same layout with its own button label, claim link untouched in text', () => {
    const msg = claimYourPurchaseEmail('purchaser@example.com', '#1001', 'https://domo-ai.com/claim/?t=abc', true);
    expect(msg.html).toBeTruthy();
    const html = msg.html!;
    expect(html).toContain('入門コースをひらく');
    expect(html).toContain('href="https://domo-ai.com/claim/?t=abc"');
    expect(html).toContain('https://domo-ai.com/email/hatena_question@2x.png');
    expect(msg.text).toContain('https://domo-ai.com/claim/?t=abc');
  });

  it('claimYourPurchaseEmail (beginnerLaunch=false): no html', () => {
    const msg = claimYourPurchaseEmail('purchaser@example.com', '#1001', 'https://example.com/claim/?t=abc', false);
    expect(msg.html).toBeUndefined();
  });
});
