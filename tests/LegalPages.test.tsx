import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TokushohoPage, TokushohoPreviewPage } from '../src/legal/tokushoho/TokushohoPage';
import { PrivacyPage } from '../src/legal/privacy/PrivacyPage';
import { COMPANY, PRODUCT } from '../src/legal/company';

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

  describe('WO-C7 item 3 (Founder, 3 Oct 2026): once BEGINNER_LAUNCH is on, the v3 field list replaces every legacy row', () => {
    async function renderLaunched() {
      vi.resetModules();
      vi.stubEnv('VITE_BEGINNER_LAUNCH', '1');
      const { TokushohoPage: LaunchedTokushohoPage } = await import('../src/legal/tokushoho/TokushohoPage');
      return render(<LaunchedTokushohoPage />);
    }

    it('names the full product and never shows "（仮）" or "モジュール1" anywhere', async () => {
      await renderLaunched();
      const text = document.body.textContent ?? '';
      expect(text).toContain(PRODUCT.fullName);
      expect(text).not.toContain('（仮）');
      expect(text).not.toContain('モジュール1');
    });

    it('names the corporate site (beyondculture.ai) as a working link, and the real phone number', async () => {
      await renderLaunched();
      expect(screen.getByText(COMPANY.corporateSiteUrl, { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: COMPANY.corporateSiteUrl })).toHaveAttribute('href', COMPANY.corporateSiteUrl);
      expect(screen.getByText(new RegExp(COMPANY.phone))).toBeInTheDocument();
    });

    it('shows every v3 field label, including the new 動作環境 row', async () => {
      await renderLaunched();
      for (const label of ['販売業者', '運営責任者', '所在地', '電話番号', 'メールアドレス', '販売価格', '商品代金以外の必要料金', 'お支払方法', 'お支払時期', '商品の引渡し時期・役務の提供時期', '動作環境', '返品・キャンセル']) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('shows the v3 payment-methods sentence, with PayPay marked pending — never as a live option', async () => {
      await renderLaunched();
      const text = (document.body.textContent ?? '').replace(/\s+/g, '');
      expect(text).toContain('PayPay（審査完了後に対応予定）'.replace(/\s+/g, ''));
      expect(text).not.toContain('メルペイ');
    });

    it('carries the exact v3 返品・キャンセル text — the child-accident clause and the exceptional-cases carve-out', async () => {
      await renderLaunched();
      const text = (document.body.textContent ?? '').replace(/\s+/g, '');
      expect(text).toContain(
        (
          '次の場合は、返金いたします。' +
          '・ご購入日時から72時間以内で、かつ、ご購入後に有料レッスン（レッスン2〜7）を一度も開いていない場合。' +
          '無料のレッスン1のご利用は、有料コンテンツの利用には含まれません。'
        ).replace(/\s+/g, ''),
      );
      expect(text).toContain('一度でも開いた場合（お子さまが誤って開いた場合を含みます）'.replace(/\s+/g, ''));
      expect(text).toContain(
        '重複請求、決済エラー、当社の責任による重大な不具合でご利用いただけない場合は、上記にかかわらず個別に対応のうえ返金いたします。'.replace(/\s+/g, ''),
      );
      expect(text).toContain('ログイン時の同意をいただけないためにご利用になれない場合で'.replace(/\s+/g, ''));
      expect(text).toContain('返金をご希望の場合は'.replace(/\s+/g, ''));
      expect(text).toContain('info@domo-ai.com');
    });
  });
});

describe('WO-C7 item 9: TokushohoPreviewPage (reviewer-only /legal/tokushoho-preview/)', () => {
  it('always shows the v3 field list, regardless of VITE_BEGINNER_LAUNCH — never flag-gated like the real page', () => {
    render(<TokushohoPreviewPage />);
    const text = document.body.textContent ?? '';
    expect(text).toContain(PRODUCT.fullName);
    expect(text).not.toContain('モジュール1');
    expect(screen.getByText('動作環境')).toBeInTheDocument();
    expect(screen.getByText(/プレビュー/)).toBeInTheDocument();
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

  it('AD-13/15/COPY-01 §8 follow-up, text C v3 4-2: discloses the Family Account server-side data (Firestore), names Postmark alone with its country, and names the /account deletion path', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Firestore/)).toBeInTheDocument();
    const text = (document.body.textContent ?? '').replace(/\s+/g, '');
    expect(text).toContain('アメリカ合衆国に所在するACPM,LLC（サービス名：Postmark）に委託'.replace(/\s+/g, ''));
    expect(screen.queryByText(/Amazon SES/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\/account/).length).toBeGreaterThan(0); // deletion path is named, not just promised — now also in §9's own disclosure/opt-out path
  });

  it('gives a real contact email, not a placeholder', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(COMPANY.email)).toBeInTheDocument();
  });

  it('COPY-01 §8: shows an updated 改定日', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/改定日/)).toBeInTheDocument();
  });

  it('text C v3 §6: states plainly that this backend never receives/stores card numbers or security codes', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    expect(text.replace(/\s+/g, '')).toContain('当社は、完全なクレジットカード番号およびセキュリティコードを取得・保存しません。'.replace(/\s+/g, ''));
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
      screen.getByText(/ファミリーアカウントでログインしてご利用いただく場合、本サービスの提供、ログイン認証、/),
    ).toBeInTheDocument();
  });

  it('text C v3: shows 制定日 (first publication, from git history) and 最終改定日 (this release)', () => {
    render(<PrivacyPage />);
    expect(screen.getByText('制定日：2026年9月18日／最終改定日：2026年10月1日')).toBeInTheDocument();
  });

  it('text C v3 §4-1: the overseas-transfer consent record is itself listed as stored data', () => {
    render(<PrivacyPage />);
    expect(
      screen.getByText('外国にある第三者への提供についての同意の記録（同意の日時、同意文の版、確認コードの入力が完了した日時）'),
    ).toBeInTheDocument();
  });

  it('text C v3: section 4-2 has the anchor id that text C\'s own link points at (#4-2)', () => {
    const { container } = render(<PrivacyPage />);
    const heading = container.querySelector('[id="4-2"]');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain('4-2');
  });

  it('text C v3 §4-2: names Postmark\'s own retention window and sub-processors', () => {
    render(<PrivacyPage />);
    const text = (document.body.textContent ?? '').replace(/\s+/g, '');
    expect(text).toContain('45日間保存されたのち削除されます'.replace(/\s+/g, ''));
    expect(text).toContain('データセンター事業者（Deft）、AmazonWebServices、Zendeskに再委託しています'.replace(/\s+/g, ''));
  });

  describe('APPI compliance follow-up (Founder, 1 Oct 2026)', () => {
    it('§1: names the business address and representative (the same Founder-confirmed values the 特商法 page publishes)', () => {
      render(<PrivacyPage />);
      expect(screen.getByText('住所')).toBeInTheDocument();
      expect(screen.getByText(COMPANY.address)).toBeInTheDocument();
      expect(screen.getByText('代表者')).toBeInTheDocument();
      expect(screen.getByText(`${COMPANY.representativeTitle} ${COMPANY.representativeName}`)).toBeInTheDocument();
    });

    it('§6: 第三者提供・委託について — no third-party disclosure without consent, outsourcing is supervised', () => {
      render(<PrivacyPage />);
      expect(screen.getByText('6. 第三者提供・委託について')).toBeInTheDocument();
      const text = (document.body.textContent ?? '').replace(/\s+/g, '');
      expect(text).toContain('あらかじめご本人の同意を得ることなく、個人情報を第三者に提供することはありません'.replace(/\s+/g, ''));
      expect(text).toContain('委託先において情報の適切な安全管理が図られるよう監督します'.replace(/\s+/g, ''));
    });

    it('§7: 安全管理措置 — safety management measures section exists', () => {
      render(<PrivacyPage />);
      expect(screen.getByText('7. 安全管理措置')).toBeInTheDocument();
      const text = (document.body.textContent ?? '').replace(/\s+/g, '');
      expect(text).toContain('個人情報の漏えい、滅失またはき損の防止その他の個人情報の安全管理のために、必要かつ適切な措置を講じます'.replace(/\s+/g, ''));
    });

    it('§9: 保有個人データの開示・訂正・利用停止等について — appears before §10 お問い合わせ, and names /account as a self-service opt-out', () => {
      render(<PrivacyPage />);
      const heading = screen.getByText('9. 保有個人データの開示・訂正・利用停止等について');
      const contactHeading = screen.getByText('10. お問い合わせ');
      expect(heading).toBeInTheDocument();
      expect(heading.compareDocumentPosition(contactHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const text = (document.body.textContent ?? '').replace(/\s+/g, '');
      expect(text).toContain('ご本人確認の上、法令に従い速やかに対応いたします'.replace(/\s+/g, ''));
      expect(text).toContain('アカウント設定画面（/account）からアカウントの削除操作を行っていただくことで'.replace(/\s+/g, ''));
    });

    it('sections are renumbered consistently 1-10 with no gap or duplicate', () => {
      render(<PrivacyPage />);
      for (let n = 1; n <= 10; n++) {
        expect(screen.getByText(new RegExp(`^${n}\\. `))).toBeInTheDocument();
      }
    });
  });
});
