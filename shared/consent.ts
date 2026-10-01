/**
 * Consent at login (PURCHASE-FLOW.md v2). The version string identifies the exact wording of the
 * consent text a family agreed to on the login screen; it is stored with the consent time on the
 * family. Changing the wording in src/legal/consentText.ts REQUIRES bumping this value, so a
 * record always says which text was agreed to. The backend only accepts a request that carries
 * the CURRENT version.
 */
export const CONSENT_TEXT_VERSION = 'v2-C-PROVISIONAL';
