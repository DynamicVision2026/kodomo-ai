/**
 * Consent at login (PURCHASE-FLOW.md v2) — the text shown on /login BEFORE a code is sent, and the
 * label of the one button that sends it.
 *
 * !! PLACEHOLDER — the legally approved "consent text C" has not been supplied yet. Do NOT ship
 * this: replace `CONSENT_TEXT_PARAGRAPHS` with the approved wording, and in the SAME change bump
 * `CONSENT_TEXT_VERSION` in shared/consent.ts so every stored consent names the exact text that
 * was agreed to. tests/consentTextPlaceholder.test.ts fails loudly while the placeholder remains
 * and RELEASE=1 is set, so it cannot reach a release build unnoticed.
 */
export const CONSENT_TEXT_PLACEHOLDER_MARKER = '【仮】';

export const CONSENT_TEXT_PARAGRAPHS: readonly string[] = [
  `${CONSENT_TEXT_PLACEHOLDER_MARKER}同意文Cは、法務の確認後に差し替えます。`,
];

export const CONSENT_BUTTON_LABEL = '同意して、コードを送る';
