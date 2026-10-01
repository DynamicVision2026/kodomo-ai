import { describe, it, expect } from 'vitest';
import { moduleActivatedEmail, claimYourPurchaseEmail } from '../backend/src/email';

// COPY-01 (28 Sep 2026): both purchase-connect emails carry new post-launch copy, but only once
// `beginnerLaunch` is true — same "go live at the same moment as BEGINNER_LAUNCH, never before"
// rule as every other COPY-01 surface. Flag-off must reproduce the exact prior copy, since real
// families still see it until launch.
describe('COPY-01 — moduleActivatedEmail retcons "モジュール1" -> "入門コース" once BEGINNER_LAUNCH is on', () => {
  it('flag off: unchanged from before COPY-01', () => {
    const msg = moduleActivatedEmail('parent@example.com', 'https://example.com/login/', false);
    expect(msg.subject).toBe('ナゼホリ モジュール1が使えるようになりました');
    expect(msg.text).toContain('モジュール1が使えるようになりました');
    expect(msg.text).toContain('https://example.com/login/');
  });

  it('flag on: final activation email (Founder, 1 Oct 2026), no residual "モジュール1" wording', () => {
    const msg = moduleActivatedEmail('parent@example.com', 'https://example.com/login/', true);
    expect(msg.subject).toBe('【ナゼホリ】入門コースがご利用いただけるようになりました');
    expect(msg.text).toContain('入門コースがご利用いただけるようになりました。');
    expect(msg.text).toContain('ご購入時のメールアドレスでログインしてください。');
    expect(msg.text).toContain('info@domo-ai.com');
    expect(msg.text).not.toContain('モジュール1');
    expect(msg.text).toContain('https://example.com/login/');
  });
});

describe('COPY-01 §5b — claimYourPurchaseEmail carries the new copy once BEGINNER_LAUNCH is on', () => {
  it('flag off: unchanged from before COPY-01', () => {
    const msg = claimYourPurchaseEmail('purchaser@example.com', '#1001', 'https://example.com/claim/?t=abc', false);
    expect(msg.subject).toBe('ナゼホリ ご購入の受け取り手続きのお願い');
    expect(msg.text).toContain('ご注文#1001のお受け取り手続きをお願いします');
    expect(msg.text).toContain('https://example.com/claim/?t=abc');
  });

  it('flag on: new subject/body, purchaser-only line included, claim link intact', () => {
    const msg = claimYourPurchaseEmail('purchaser@example.com', '#1001', 'https://example.com/claim/?t=abc', true);
    expect(msg.subject).toBe('ナゼホリ入門コース｜ご購入ありがとうございます');
    expect(msg.text).toContain('下のボタンから、ご家族のアカウントとつなげてください。');
    expect(msg.text).toContain('つなげると、入門コースの7つのレッスンがひらきます。');
    expect(msg.text).toContain('このリンクは、ご購入いただいた方専用です。');
    expect(msg.text).toContain('info@domo-ai.com');
    expect(msg.text).toContain('https://example.com/claim/?t=abc');
    expect(msg.text).not.toContain('72時間');
    expect(msg.text).not.toContain('モジュール1');
  });
});
