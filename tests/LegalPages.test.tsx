import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TokushohoPage } from '../src/legal/tokushoho/TokushohoPage';
import { PrivacyPage } from '../src/legal/privacy/PrivacyPage';
import { COMPANY } from '../src/legal/company';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('TokushohoPage', () => {
  it('shows a draft banner (this has not had the founder\'s legal review yet)', () => {
    render(<TokushohoPage />);
    expect(screen.getByText(/草案/)).toBeInTheDocument();
  });

  it('discloses every field required by 特定商取引法, with the real confirmed company data', () => {
    render(<TokushohoPage />);
    for (const label of ['販売業者', '運営統括責任者', '所在地', '電話番号', 'メールアドレス', '商品名', '販売価格', 'お支払い方法', 'お支払い時期', '商品の引き渡し時期', '返品・キャンセルについて']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(COMPANY.name)).toBeInTheDocument();
    expect(screen.getByText(COMPANY.address)).toBeInTheDocument();
    expect(screen.getByText(COMPANY.email)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(COMPANY.representativeName))).toBeInTheDocument();
  });

  it('discloses a phone contact path rather than silently omitting the field', () => {
    render(<TokushohoPage />);
    expect(screen.getByText(/ご請求いただければ/)).toBeInTheDocument();
  });

  it('AD-15: no longer states the retired 30-day refund guarantee, and states the household licence in natural Japanese (spec v0.5 §9)', () => {
    render(<TokushohoPage />);
    expect(screen.queryByText(/30日間/)).not.toBeInTheDocument();
    expect(screen.getByText(/世帯ライセンス/)).toBeInTheDocument();
    expect(screen.queryByText(/household licence/)).not.toBeInTheDocument();
  });

  it('flag off (today\'s real deploy state): still names the product "モジュール1" and the refund row is still the pending placeholder', () => {
    render(<TokushohoPage />);
    expect(screen.getByText(/モジュール1/)).toBeInTheDocument();
    expect(screen.getByText(/返金ポリシーは近日公開予定です/)).toBeInTheDocument();
  });

  it('COPY-01: once BEGINNER_LAUNCH is on, 商品名 says 入門コース and the refund row carries the exact legally-approved sentence', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_BEGINNER_LAUNCH', '1');
    const { TokushohoPage: LaunchedTokushohoPage } = await import('../src/legal/tokushoho/TokushohoPage');
    render(<LaunchedTokushohoPage />);
    expect(screen.getAllByText(/入門コース/).length).toBeGreaterThan(0);
    expect(screen.getByText('ナゼホリ（仮）（入門コース）')).toBeInTheDocument();
    expect(screen.queryByText(/モジュール1/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'ご購入から10日以内で、入門コースのレッスンをまだ始めていない場合は、info@domo-ai.com までご連絡いただければ返金いたします。' +
          'プレイグラウンドを使ったことや、ログインしたことは「始めた」に含みません。',
      ),
    ).toBeInTheDocument();
  });
});

describe('PrivacyPage', () => {
  it('shows a draft banner', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/草案/)).toBeInTheDocument();
  });

  it('accurately states there is no PII input in the app itself', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/入力する項目は/)).toBeInTheDocument();
  });

  it('names Shopify and KOMOJU as the checkout/payment platforms (COPY-01 §8 follow-up: KOMOJU stays named, only PayPal is dropped)', () => {
    render(<PrivacyPage />);
    expect(screen.getAllByText(/Shopify/).length).toBeGreaterThan(0);
    expect(screen.getByText(/KOMOJU/)).toBeInTheDocument();
    expect(screen.queryByText(/PayPal/)).not.toBeInTheDocument();
  });

  it('AD-13/15/COPY-01 §8 follow-up: discloses the Family Account server-side data (Firestore), names Postmark alone with its country, and names the /account deletion path', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Firestore/)).toBeInTheDocument();
    expect(screen.getByText(/Postmark、所在国：アメリカ合衆国/)).toBeInTheDocument();
    expect(screen.queryByText(/Amazon SES/)).not.toBeInTheDocument();
    expect(screen.getByText(/\/account/)).toBeInTheDocument(); // deletion path is named, not just promised
  });

  it('gives a real contact email, not a placeholder', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(COMPANY.email)).toBeInTheDocument();
  });

  it('COPY-01 §8: shows an updated 改定日', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/改定日/)).toBeInTheDocument();
  });

  it('COPY-01 §8: states plainly that this backend never receives/stores card or other payment details', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    expect(text.replace(/\s+/g, '')).toContain('当社が、クレジットカード番号などのお支払い情報を受け取ることはありません。'.replace(/\s+/g, ''));
  });

  it('COPY-01 §8: no longer describes a no-account "free trial" mode or a 72-hour account trial — true before and after BEGINNER_LAUNCH, since login has always been required in every real deployment (src/family/api.ts\'s isFamilyApiConfigured() is unconditionally true — Dockerfile.frontend always sets VITE_FAMILY_API_URL)', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('無料でお試しいただける範囲');
    expect(text).not.toContain('アカウント登録なし');
    expect(text).not.toContain('72時間');
    expect(text).not.toContain('お試し期間');
    expect(screen.getByText(/本サービスは、保護者の方のメールアドレスでログインしてご利用いただきます。/)).toBeInTheDocument();
  });

  it('COPY-01 §8: section 4 always describes Family Account storage as what happens on login, not conditioned on purchase-or-trial', () => {
    render(<PrivacyPage />);
    expect(
      screen.getByText(/ファミリーアカウントでログインしてご利用いただく場合、以下の情報を当社のサーバー/),
    ).toBeInTheDocument();
  });
});
