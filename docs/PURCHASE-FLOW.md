# Purchase flow: 入門コース

v2, 28 Sep 2026: after the legal review, the Founder chose "consent at login" for Postmark (USA, APPI Art. 28). Parts marked (NEW) are to be built; the rest is confirmed in the code (webhook.ts, claims.ts, adminRouter.ts, beginnerLicence.ts).

## Rule (NEW)

- No email goes through Postmark to an address without recorded consent. Consent is given on the login screen (「同意して、コードを送る」) before the first code is sent.

## Buy

1. The parent taps a buy button:
   - inside the app (logged in, so consent is already given; 「入門コースで、ひらこう」) → Shopify checkout carries a purchase token for that family;
   - on the landing page (NEW: log in first, with consent) → then to Shopify with the purchase token;
   - straight in the Shopify store (rare) → no token.
2. The parent pays in Shopify (cards Visa / Mastercard / AMEX / JCB; Shop Pay; Apple Pay; Google Pay; PayPal). Shopify sends its own order confirmation.
3. Shopify notifies our backend (orders/paid webhook). The backend saves the order and the buyer's email only, never payment details.

## Unlock

4. Purchase token → bound to that family at once → email 「【ナゼホリ】入門コースがご利用いただけるようになりました」 (consent exists).
5. Else, buyer email = an existing family's login email → bound at once → the same email if that address has consent; otherwise no email (the family sees the course at its next login).
6. Else (new buyer, bought straight in the store) → (NEW) no email. The Shopify description says: log in with the purchase email. At login (with consent), unbound paid orders with the same email bind automatically.
7. Different email with no token (e.g. the father paid in the store, the family uses the mother's email) → the parent contacts info@ → staff bind the order in the Admin Dashboard.
8. Order with no email → "needs review" for staff.
9. The family logs in → all 7 lessons are open; progress is saved to the family account, on any device.

## Staff tools (Admin Dashboard)

- Bind an order to a family by hand.
- Resend the claim link (use only for addresses with consent).
- Turn a family's course access off/on (reason required).

## Refund

- The parent emails info@domo-ai.com within 10 days, before starting a lesson → the Founder refunds in Shopify → access is removed automatically (refunds/create webhook). The account, profiles and progress stay.

## Existing "Module 1" buyers

- The same entitlement (m1) unlocks the beginner course; nothing to do. They see the consent screen at their next login.

## Before launch

- Postmark account approval. (DONE 1 Oct 2026)
- Legal + 酒井先生 approval of the privacy policy v2 and the consent text (ナゼホリ_確認依頼2).
- Builder: consent screen, consent record, the send-only-with-consent rule, bind-on-login, and the landing page's buy button going to login first. (BUILT 1 Oct, held on branch consent-at-login)
- One real end-to-end test by the Founder: from the landing page, log in with a fresh email (consent), buy, open the course, refund, then check that access is removed.
