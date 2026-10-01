/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  claimYourPurchaseEmail, deviceEvictedEmail, emailChangedEmail, loginCodeEmail, moduleActivatedEmail,
} from '../backend/src/email';

/**
 * Item 7 (Founder, 1 Oct 2026): "confirm no email contains a child's nickname, avatar, profile, or
 * learning record." Every email this backend sends is built by one of the five functions imported
 * above (backend/src/email.ts) — each takes only an address, a code, a URL, an order name, or a
 * device label as its parameters, so there is no parameter a caller COULD use to pass child data
 * through even by mistake. This test pins that down two ways: the banned-word scan below of each
 * function's actual output with representative inputs, and the call-site scan, which would fail if
 * a future call site ever passed a profile/avatar/nickname/progress value as an argument.
 */
const BANNED_SUBSTRINGS = [
  'avatarId', 'nicknameId', 'アバター', 'ニックネーム', 'プロフィール', 'profile', 'progress',
  '進行状況', '学習記録', 'stage',
];

function assertClean(label: string, text: string): void {
  for (const banned of BANNED_SUBSTRINGS) {
    expect(text, `${label} must not contain "${banned}"`).not.toContain(banned);
  }
}

describe('item 7 — no email contains a child nickname, avatar, profile, or learning record', () => {
  it('loginCodeEmail: only the code', () => {
    const msg = loginCodeEmail('parent@example.com', '123456', 'https://app.example.com');
    assertClean('loginCodeEmail subject', msg.subject);
    assertClean('loginCodeEmail text', msg.text);
    assertClean('loginCodeEmail html', msg.html ?? '');
  });

  it('moduleActivatedEmail: only a login URL (both flag states)', () => {
    for (const beginnerLaunch of [true, false]) {
      const msg = moduleActivatedEmail('parent@example.com', 'https://app.example.com/login/', beginnerLaunch);
      assertClean(`moduleActivatedEmail(beginnerLaunch=${beginnerLaunch}) subject`, msg.subject);
      assertClean(`moduleActivatedEmail(beginnerLaunch=${beginnerLaunch}) text`, msg.text);
      assertClean(`moduleActivatedEmail(beginnerLaunch=${beginnerLaunch}) html`, msg.html ?? '');
    }
  });

  it('claimYourPurchaseEmail: only the order name and claim URL (both flag states)', () => {
    for (const beginnerLaunch of [true, false]) {
      const msg = claimYourPurchaseEmail('purchaser@example.com', '#1001', 'https://app.example.com/claim/?t=abc', beginnerLaunch);
      assertClean(`claimYourPurchaseEmail(beginnerLaunch=${beginnerLaunch}) subject`, msg.subject);
      assertClean(`claimYourPurchaseEmail(beginnerLaunch=${beginnerLaunch}) text`, msg.text);
      assertClean(`claimYourPurchaseEmail(beginnerLaunch=${beginnerLaunch}) html`, msg.html ?? '');
    }
  });

  it('deviceEvictedEmail: only coarse device labels (platform/browser, never a profile)', () => {
    const msg = deviceEvictedEmail('parent@example.com', 'iPad · Safari', 'iPhone · Chrome');
    assertClean('deviceEvictedEmail subject', msg.subject);
    assertClean('deviceEvictedEmail text', msg.text);
  });

  it('emailChangedEmail: only the other address', () => {
    const msg = emailChangedEmail('old@example.com', 'new@example.com');
    assertClean('emailChangedEmail subject', msg.subject);
    assertClean('emailChangedEmail text', msg.text);
  });

  it('every call site in backend/ passes only addresses/codes/URLs/order-names/device-labels — never a profile/avatar/nickname/progress value', () => {
    const emailBuilderNames = [
      'loginCodeEmail', 'moduleActivatedEmail', 'claimYourPurchaseEmail', 'deviceEvictedEmail', 'emailChangedEmail',
    ];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(name) || full.endsWith(join('src', 'email.ts'))) continue;
        const content = readFileSync(full, 'utf8');
        for (const fn of emailBuilderNames) {
          const callRegex = new RegExp(`${fn}\\(([^;]*?)\\)`, 'g');
          for (const match of content.matchAll(callRegex)) {
            const args = match[1] ?? '';
            for (const banned of ['avatarId', 'nicknameId', 'profile', 'progress', '.stage']) {
              if (new RegExp(banned, 'i').test(args)) offenders.push(`${full}: ${fn}(${args.slice(0, 80)})`);
            }
          }
        }
      }
    };
    walk('backend');
    expect(offenders).toEqual([]);
  });
});
