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
  address: '〒143-0023 東京都大田区山王2丁目5番13号 大森北口ビル5F5-72',
  corporateNumber: '6011701025709',
  email: 'info@soul-id.jp',
  legalSiteUrl: 'https://soul-id.jp/',
};

export const PRODUCT = {
  // Spec v0.5 §0.3 (founder task): the product name is still a working title pending
  // J-PlatPat + domain checks — do not present it as final.
  workingTitle: 'ナゼホリ（仮）',
  price: '¥4,980（税込）',
};
