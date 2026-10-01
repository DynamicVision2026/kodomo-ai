# Consent at login (PURCHASE-FLOW.md v2) — HELD, not deployed

Branch `consent-at-login` (local, never pushed). Do not deploy this or the held privacy-policy
commit until legal approval is confirmed.

## What it does
- `/login`: consent text shown before the code is requested; one button 「同意して、コードを送る」.
  The request carries `consentTextVersion` (shared/consent.ts). Opening the page sends nothing.
- Backend stores `consentAt` + `consentTextVersion` on the family (new family at first verified
  login; an existing family on its next consenting login; same wording keeps the first time).
- Rule: no email to any address without recorded consent. Every send goes through
  `sendEmailWithConsent` (backend/src/emailGate.ts); a test fails if anything calls
  `env.email.send(` directly. Allowed without a family lookup only for (a) the login code of the
  request that is itself carrying consent, (b) the code to a NEW address for a signed-in,
  consenting family (email change). Everything else (claim links, moduleActivatedEmail, device /
  email-change notices, admin resends) needs the recipient address to belong to a consenting family.
- Paid orders with no matching consenting family wait as `awaiting_claim` and **no claim link is
  emailed**. On a verified login whose email matches, they are bound (`email_match`) and the
  activation email follows (backend/src/bindOnLogin.ts).
- Landing buy button: signed out -> `/login/?next=/account/?buy=1`; signed in without consent ->
  `/login/?reconsent=1&…`; `/account/?buy=1` then creates the purchase intent and goes to Shopify
  with the `domo_pt` token (same-tab redirect when the popup is blocked), once.
- `/me` gains `consentRecorded`.

## Before release
1. Replace the placeholder in `src/legal/consentText.ts` with the legally approved text C.
2. Bump `CONSENT_TEXT_VERSION` in `shared/consent.ts` in the same change.
3. `RELEASE=1 npx vitest run tests/consentTextPlaceholder.test.ts` must pass.
4. Deploy frontend + backend together (the old login screen sends no consent and would get no code).
5. Families created before this change have no consent: they get no email until they log in again
   with consent (their login code is the only thing that still works for them: it is blocked too
   unless the request carries consent, so the new screen is the only way back in by code).
