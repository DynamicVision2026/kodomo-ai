# AD-16 §9 — Firestore schema/index/TTL changes

Everything below is Google Cloud project configuration, not application code — nothing in this
repo can express it (Firestore TTL policies and composite indexes are project-level resources,
configured once via `gcloud`/the console, independent of what gets deployed). This is the
"apply all Firestore schema/index/TTL changes specified in AD-16" checklist for whoever has
`gcloud` access to the production project.

## New collections (AD-16 §9), for reference — see `backend/src/schema.ts` for the doc shapes

`purchaseIntents/{tokenHash}`, `claims/{tokenHash}`, `orders/{shopifyOrderId}` (expanded),
`families/{familyId}/trials/{moduleId}`, `families/{familyId}/usage/{moduleId}`,
`staff/{email}`, `config/refundPolicy` (single doc), `auditLog/{id}`.

## TTL policies

Two of the new collections carry a real, bounded lifetime and should never accumulate forever:

```sh
# purchaseIntents/{tokenHash} — AD-16 §1: "+14 days." Safe to delete a stale, never-redeemed
# intent automatically; nothing else ever reads one after its own expiresAt has passed.
gcloud firestore fields ttls update expiresAt \
  --collection-group=purchaseIntents --enable-ttl

# claims/{tokenHash} — AD-16 §2: "valid 30 days." Same reasoning — an expired, unclaimed claim
# is dead weight once expiresAt has passed (the order itself stays in `orders/`, unaffected;
# only the claim TOKEN record is TTL'd).
gcloud firestore fields ttls update expiresAt \
  --collection-group=claims --enable-ttl
```

Every other new collection is a permanent record (`orders`, `auditLog`, `staff`,
`families/*/trials`, `families/*/usage`) and must NOT have a TTL — `orders`/`auditLog` in
particular are the durable ledger AD-16 §4/§8 describe; a TTL on either would silently destroy
the one thing this whole architecture exists to keep.

(The pre-existing `rateLimits`/`loginCodes` TTL policies from AD-13, if not already configured,
follow the identical pattern against their own `expiresAt` field — unchanged by AD-16.)

## Composite indexes

None needed. Every AD-16 admin lookup (`backend/src/adminRouter.ts`'s `handleQueue`) filters on
exactly one field per query (`bindingState`, `entitlementState`, or the nested `refund.state`) —
Firestore auto-creates the required single-field index for each of these automatically, including
for the nested `refund.state` path, the same as any other field. `firestore.indexes.json` only
ever needs an entry for a genuinely composite (multi-field, e.g. `where(...).where(...)`) query,
and AD-16 introduces none of those; the one pre-existing entry (`sessions`, from AD-13's own
active-session listing) is unchanged.

If a future admin feature ever needs to sort a queue (e.g. "orders needing review, oldest
first") that WOULD become a composite query (`where('bindingState', '==', ...).orderBy(...)`)
and would need its own `firestore.indexes.json` entry at that time — noted here so it isn't
missed later, not because anything in this delta needs it yet.
