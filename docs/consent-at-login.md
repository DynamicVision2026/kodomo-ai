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

## Consent text C
`src/legal/consentText.ts` holds the text exactly as sent to legal (1 Oct 2026), version
`v2-C-2026-10-01` (`shared/consent.ts`). `tests/consentTextVersion.test.ts` pins a hash of the text
to the version: editing the wording without bumping the version (and adding the new hash) fails.
If legal changes anything: edit the text, bump the version, add the new hash — never edit an old
entry.

## Release = ONE push (frontend + backend together; CI deploys both from the same run)
The branch `consent-at-login` is already linear on top of the deployed Push B (825770f):
held privacy commit, then consent. When the Founder says "legal approved":

    git checkout claude/sprint-1-setup-ok4oym
    git merge --ff-only consent-at-login
    git push -u origin claude/sprint-1-setup-ok4oym

Then watch the single CI run (about 15-20 min), do not cancel it, check once when done.
Never push `consent-at-login` to any other remote branch.

## Checked against PURCHASE-FLOW.md v2 (docs/PURCHASE-FLOW.md)
Matches: the rule; landing buy -> login (with consent) -> Shopify with the token; token bind +
activation email; email match binds at once, email only if the address has consent; unbound order
+ new buyer -> no email, binds at login; admin bind; no-email order -> needs_review; refund path
untouched (no email); m1 unlocks the beginner course; staff tools exist (bind, resend-claim,
entitlement on/off).

Differences / things to know (Founder decisions, 1 Oct 2026):
1. Resend claim link: the doc says "use only for addresses with consent". The build ENFORCES it
   (blocked at the gate) and the operator is told: the endpoint answers 202 with
   `{emailSent:false, reason:"no_consent"}`; the audit entry records `emailSent`. (kept as built)
2. In-app buy: the locked garden's 「入門コースで、ひらこう」 button now goes straight to
   `/account/?buy=1` — one tap, matching the doc's own flow. (FIXED, decision 1)
3. "Logged in, so consent is already given" is not true for sessions that began before this
   release: those families have no consent record until their next fresh login (or a landing buy,
   or an email-change/deletion request, which now send them to the consent screen first). Until
   then they get no email (activation, device notices); the course itself works. (accepted as is,
   decision 3 — no extra screen)
4. The Shopify product description ("log in with the purchase email") is on the Shopify side, not
   in this repo. (Founder handles on launch day, decision 4)
5. Orders whose email matches no consenting family keep their (now never-emailed) claim record;
   they bind on login. A claim link can still be used if staff hand one over another way.

## Fixed during the consent-at-login build: account-deletion OTP bug (decision 2, 1 Oct 2026)
`/me` only ever returns a MASKED email (`p***@example.com`). The account page's deletion-code
button used to pass that string straight to the public `POST /auth/request` — the real address
never got the code (it either hashed to no family, or — pre-consent-at-login — tried to send to a
literal "p***@example.com"). Fixed with a new authenticated endpoint,
`POST /api/v1/account/delete-code` (`backend/src/handlers/account.ts`
`handleRequestDeleteCode`): it resolves the session, reads the family's own REAL stored email
server-side, and sends there via `sendEmailWithConsent` with a `family` consent basis — the
client never supplies or sees the real address. `src/family/api.ts` exports `requestDeleteCode()`;
`AccountPage.tsx`'s `sendDeleteCode` now calls it instead of `requestLoginCode(me.email)`. Tests:
`tests/backendAccountSecurity.test.ts` (requires a session; ignores anything the client sends in
the body) and `tests/consentAtLoginFrontend.test.tsx` (the button calls the new endpoint, never
`/auth/request`, with no email in the request body).
