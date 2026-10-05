/**
 * Real company data, confirmed by the founder directly from https://soul-id.jp/ (会社概要),
 * 2026-09-18. src/legal is excluded from gate:no-hardcoded-copy — same treatment as src/lp,
 * since this is business-voice legal content, not child-facing app copy (spec v0.5 §7).
 *
 * These pages are DRAFTS. The founder still owes them the "one professional legal check"
 * spec v0.5 §14 already calls for (price display + policy wording) before public launch —
 * correct required fields is not the same thing as a lawyer's sign-off.
 */
export const COMPANY = {
  name: 'Beyond Culture 獨歩文化株式会社',
  representativeTitle: '代表取締役',
  representativeName: '傅豊国',
  address: '〒143-0023 東京都大田区山王2丁目5番13号 大森北口ビル5F 5-72',
  corporateNumber: '6011701025709',
  // Post-launch-check (Founder, iPhone test): every ナゼホリ contact/support address is
  // info@domo-ai.com — soul-id.jp is the operating company's own separate site/brand, never
  // shown to a ナゼホリ parent as where to write for help.
  email: 'info@domo-ai.com',
  // WO-C7 item 3 (Founder, 3 Oct 2026): the corporate site moved from soul-id.jp to this domain —
  // the 特商法 page's own 販売業者 row names it directly.
  corporateSiteUrl: 'https://beyondculture.ai',
  // WO-C7 item 3: a real phone contact, replacing the old "disclose on request" placeholder.
  phone: '080-5157-2817',
  phoneHours: '受付時間：平日10:00〜18:00',
};

// WO-C7 item 3 (Founder, 3 Oct 2026, v3 verbatim) — the one source of truth for the payment
// methods sentence, shared by the 特商法 page and the landing-page FAQ so they never drift.
// Ticket (5 Oct 2026, KOMOJU contract terminated): the two KOMOJU-processed wallet methods are
// dropped entirely — only what Shopify itself processes stays listed.
export const PAYMENT_METHODS_LIST =
  'クレジットカード（Visa・Mastercard・American Express・JCB）、Apple Pay、Google Pay、Shop Pay、PayPal';

export const PRODUCT = {
  // WO-C7 item 1/11 (Founder, 3 Oct 2026): the brand name itself, finalized — no longer the
  // working title pending J-PlatPat/domain checks (spec v0.5 §0.3's own caveat, now resolved).
  // Used wherever the SERVICE is named generally (not a specific purchasable SKU) — never
  // flag-gated, since dropping "（仮）" is a naming finalization unrelated to the course launch.
  brand: 'ナゼホリ',
  // WO-C7 item 1/11: the specific 入門コース product's name — the post-launch SKU, not the brand.
  name: 'ナゼホリ 入門コース',
  // WO-C7 item 11: the full name, matching the Shopify product title — used wherever the product
  // is named as a purchasable thing (特商法 販売価格 row, etc.), not for casual in-app references.
  fullName: 'ナゼホリ 入門コース（家族ライセンス・買い切り）',
  price: '¥4,980（税込）',
};
