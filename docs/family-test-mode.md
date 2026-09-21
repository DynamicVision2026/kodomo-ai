# Family-test mode

WO-23 (v0.7a Productization, AD-06 §8) needs a way to hand the real running product to a
Grade 3-4 family for an unassisted playtest before Shopify checkout exists. That family has no
purchase, no redeemed code, and no `m1:full` entitlement — under real production rules
(`src/engine/entitlements.ts`'s `hasAccess()`), every mission past `freeMissionIds` would show
the locked screen. Family-test mode is a build-time-only bypass for exactly that gap. It is not
a second entitlement system and it is not commerce.

## What it does

- Adds one optional prop to `MissionShell`: `familyTestMode?: boolean` (default `false`).
- When `true`, the two places `MissionShell` calls `hasAccess()` (entering a Story mission,
  entering a Bank Dig — both inside `enterMission()`, `src/shell/MissionShell.tsx`) skip that
  call and go straight to the coop question, exactly as if `hasAccess()` had returned `true`.
- Every other reachability rule is unchanged: Course Home still shows undug depths dimmed
  (never "locked"), the same mission/bank libraries, the same profiles, the same storage.

## What it explicitly does NOT do

- It never modifies, wraps, or short-circuits `hasAccess()` itself. That function is the one
  place production entitlement logic lives, and this sprint's brief was explicit: "never
  weakening production `hasAccess` logic." A real production build calls the exact same
  `hasAccess()` family-test builds skip past — nothing about its own behavior changed.
- It grants no fake entitlement record, writes nothing to `AppState.entitlements`, and leaves
  `localStorage` exactly as a real session would (minus the purchase).
- It has no relationship to commerce, Shopify, redeemed codes, or `docs/task7-shopify-backend-runbook.md`.
  Turning it on does not simulate a purchase; it removes the entitlement CHECK for this build only.

## How to turn it on

Build-time only, via `VITE_FAMILY_TEST_MODE`:

```
VITE_FAMILY_TEST_MODE=1 npm run build
# or, for a local dev server:
VITE_FAMILY_TEST_MODE=1 npm run dev
```

`src/main.tsx` reads this once, at module load (`import.meta.env.VITE_FAMILY_TEST_MODE === '1'`),
and passes the result straight through to `MissionShell`'s `familyTestMode` prop. There is no
runtime toggle, no query string, no localStorage flag — a real production build simply never
sets this env var, so `familyTestMode` is `false` and every entitlement check runs exactly as it
always has.

## When to use it

Only for handing a build to a family (or a reviewer) who needs to reach all 8 Story Missions and
all 12 Bank Digs to prove the product is family-playable end to end — the WO-23 "family-test
ready" gate. Never ship a family-test build as the public production build; never point real
paying users at one.
