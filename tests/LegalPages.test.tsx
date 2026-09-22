import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TokushohoPage } from '../src/legal/tokushoho/TokushohoPage';
import { PrivacyPage } from '../src/legal/privacy/PrivacyPage';
import { COMPANY } from '../src/legal/company';

afterEach(() => cleanup());

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

  it('states the 30-day refund guarantee (plus the pre-order period, spec v0.5 §9) and the household licence in natural Japanese, matching spec v0.5 §9', () => {
    render(<TokushohoPage />);
    expect(screen.getByText(/30日間/)).toBeInTheDocument();
    expect(screen.getByText(/お届け前はいつでも/)).toBeInTheDocument();
    expect(screen.getByText(/世帯ライセンス/)).toBeInTheDocument();
    expect(screen.queryByText(/household licence/)).not.toBeInTheDocument();
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

  it('names the real third parties involved in checkout and analytics', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Shopify/)).toBeInTheDocument();
    expect(screen.getByText(/KOMOJU/)).toBeInTheDocument();
    expect(screen.getByText(/PayPal/)).toBeInTheDocument();
  });

  it('gives a real contact email, not a placeholder', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(COMPANY.email)).toBeInTheDocument();
  });
});
