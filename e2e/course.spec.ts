import { test, expect, type Page } from '@playwright/test';

/**
 * WO-C1/WO-C2 acceptance: "must show one demo lesson end to end, driven entirely by a JSON content
 * file," browser-tested "with storage blocked." No real backend runs in this environment, so
 * every `/api/v1/*` call the course shell makes is intercepted with a fixture response — same
 * honest "Chromium at each device's own viewport, not a real backend" framing as e2e/ad12.spec.ts
 * already uses for its own "not real WebKit" caveat. The demo lesson (`c00-demo`, deliberately
 * excluded from course.json's `parts`) needs no allowlist/gate state to be worth walking through
 * end to end — `me.courseAllowed: true` here just lets Course Home render at all.
 *
 * Requires the `dist/` this config's webServer serves to have been built with
 * VITE_FAMILY_API_URL=/api/v1 (so `src/family/api.ts`'s `apiFetch` actually issues same-origin
 * requests for these routes to intercept) — a normal production build leaves it unset, so this
 * spec is run against its own rebuild, not the repo's default `dist/`.
 *
 * WO-C2 §7/instruction 5: real audio isn't recorded yet, so `<audio>` sources 404 in this
 * environment. "Reaching the end" of a きく step is simulated by driving the scrub `<input
 * type="range">` to its max value directly (seeking is explicitly allowed per WO-C2 §2 — this
 * exercises the exact same `seekTo` path a real drag would).
 */

function meResponse(courseAllowed: boolean) {
  return {
    familyId: 'fam_test',
    email: 'test@example.com',
    entitlements: [],
    profiles: [{ id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 }],
    trials: [],
    courseAllowed,
  };
}

async function mockCourseBackend(page: Page, courseAllowed = true) {
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: meResponse(courseAllowed) }));
  await page.route('**/api/v1/profiles/p1/progress/m1', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1, rev: 0, updatedAt: new Date(0).toISOString(),
        missions: {}, moveProgress: {}, milestones: {}, m2Evidence: { proxyMissionIds: [] },
        memories: {}, guidance: {}, checkpointAudioHeard: [],
      },
    }),
  );
  await page.route('**/api/v1/profiles/p1/course-progress/stage2', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: {
          schemaVersion: 1, rev: 0, updatedAt: new Date(0).toISOString(),
          lessons: {}, earlyUnlockedParts: [], sixtyPercentNoticeShown: [],
        },
      });
    }
    // PUT: the client already applies its own optimistic update before this resolves — this
    // mock only needs to echo a well-shaped CourseProgressDoc back, not track real server state.
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { schemaVersion: 1, rev: 1, updatedAt: new Date().toISOString(), ...body } });
  });
}

/** Drives the scrub `<input type="range">` on the current Listen screen to its max value (WO-C2
 *  §2: "seeking allowed" — reaching the end this way is the same `seekTo` path a real drag takes)
 *  then presses 「れんしゅうへ」. */
async function finishListening(page: Page) {
  const scrub = page.locator('.course-listen__scrub-input');
  await expect(scrub).toBeVisible();
  await scrub.evaluate((el: HTMLInputElement) => {
    // React installs its own tracked `value` setter on a controlled input, so a plain
    // `el.value = ...` gets swallowed by that tracker and never fires the synthetic `onChange` —
    // the standard workaround is to call through the NATIVE setter first (bypassing React's
    // override, leaving its tracked "last value" stale) and only then dispatch the real event.
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    nativeSetter.call(el, el.max);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const toExercise = page.getByRole('button', { name: 'れんしゅうへ' });
  await expect(toExercise).toBeEnabled();
  await toExercise.click();
}

/** Picks options on the current practice item until the `best` one resolves it (its role isn't
 *  exposed in the DOM, by design — F3/MoveCard's own "equal choices stay visually equal"), then
 *  presses 「つぎへ」 — twice, if this was the last item in the block (WO-C2 §3.2's own
 *  「れんしゅう、おわり！」 interstitial also uses the label 「つぎへ」). Bounded so a real
 *  regression (no option ever resolving) fails the test instead of hanging. */
async function solvePracticeItem(page: Page) {
  const nextButton = page.getByRole('button', { name: 'つぎへ', exact: true });
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await nextButton.isVisible().catch(() => false)) break;
    // Cycle through the currently-enabled options by position rather than always the first one —
    // after 2 misses the tried cards become disabled (WO-C2 §3.2's own "のこりは一まい"), so
    // always clicking .first() can get stuck retrying the same already-tried, now-disabled card.
    const options = page.locator('.course-exercise__options button:not([disabled])');
    const count = await options.count();
    await options.nth(count > 0 ? attempt % count : 0).click();
    const retry = page.getByRole('button', { name: 'もう一回えらぶ' });
    if (await retry.isVisible({ timeout: 2000 }).catch(() => false)) await retry.click();
  }
  await expect(nextButton).toBeVisible();
  await nextButton.click();
  // Last item in the block: the 「れんしゅう、おわり！」 interstitial shows its OWN 「つぎへ」.
  if (await nextButton.isVisible({ timeout: 1000 }).catch(() => false)) await nextButton.click();
}

test.describe('WO-C1/WO-C2 — course shell, demo lesson end to end (8-step flow)', () => {
  test('garden -> lesson -> all 7 steps in order -> back to garden', async ({ page }) => {
    await mockCourseBackend(page);
    // "works with storage blocked" — localStorage/sessionStorage throw on any access, same as a
    // browser privacy mode that blocks site storage entirely. The course shell never reads or
    // writes either (all state is server round-tripped or in-memory React state), so this proves
    // that structurally rather than just by code inspection.
    await page.addInitScript(() => {
      const blocked = () => { throw new DOMException('blocked', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { get: blocked });
      Object.defineProperty(window, 'sessionStorage', { get: blocked });
    });

    await page.goto('/course/');
    await expect(page.getByText('だれが つかいますか？')).toBeVisible();
    await page.getByRole('button', { name: /プロフィール 1/ }).click();

    await expect(page.getByRole('heading', { name: 'ナゼホリの にわ' })).toBeVisible();
    await page.getByRole('button', { name: 'デモレッスンを あそぶ' }).click();

    // Lesson hub
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Step 1: きくA
    await page.getByRole('button', { name: 'きく A' }).click();
    await finishListening(page);
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Step 2: えらぶA (1 item)
    await page.getByRole('button', { name: /えらぶ A/ }).click();
    await solvePracticeItem(page);
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Step 3: きくB
    await page.getByRole('button', { name: 'きく B' }).click();
    await finishListening(page);
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Step 4: えらぶB (1 item)
    await page.getByRole('button', { name: /えらぶ B/ }).click();
    await solvePracticeItem(page);
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Step 5: つくる (both blocks in sequence)
    await page.getByRole('button', { name: 'つくる', exact: true }).click();
    await page.getByRole('button', { name: 'いってみた！' }).click();
    await page.getByRole('button', { name: /つぎへ|レッスンに もどる/ }).click();
    await page.getByRole('button', { name: 'いってみた！' }).click();
    await page.getByRole('button', { name: /つぎへ|レッスンに もどる/ }).click();
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Step 6: つたえる
    await page.getByRole('button', { name: 'つたえる' }).click();
    await page.getByRole('button', { name: 'いえた！' }).click();
    await expect(page.getByText('できたね！')).toBeVisible();
    await page.getByRole('button', { name: 'つぎへ' }).click();
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Step 7: かぞくで しらべる
    await page.getByRole('button', { name: 'かぞくで しらべる' }).click();
    await expect(page.getByRole('button', { name: /おうちでしらべた/ })).toBeEnabled();
    await page.getByRole('button', { name: /おうちでしらべた/ }).click();
    await page.getByRole('button', { name: 'もどる' }).click();
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Back to the garden
    await page.getByRole('button', { name: 'もどる' }).click();
    await expect(page.getByRole('heading', { name: 'ナゼホリの にわ' })).toBeVisible();
  });

  test('a locked step shows a note instead of opening', async ({ page }) => {
    await mockCourseBackend(page);
    await page.goto('/course/');
    await page.getByRole('button', { name: /プロフィール 1/ }).click();
    await page.getByRole('button', { name: 'デモレッスンを あそぶ' }).click();
    await page.getByRole('button', { name: /えらぶ A/ }).click(); // listenA not done yet
    await expect(page.getByText('まえの ステップを おわらせると、ひらくよ。')).toBeVisible();
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible(); // still on the hub, never entered
  });

  test('parent screen reachable from the garden, shows the progress table', async ({ page }) => {
    await mockCourseBackend(page);
    await page.goto('/course/');
    await page.getByRole('button', { name: /プロフィール 1/ }).click();
    await page.getByRole('button', { name: 'おうちの 人 へ' }).click();
    await expect(page.getByRole('heading', { name: 'おうちの 人 へ' })).toBeVisible();
  });
});

/**
 * WO-C1 §1 / Coordinator (before-deploy checklist): with the build-time flag off (this build was
 * NOT built with VITE_COURSE_ENABLED=1 — see the file-level comment on how it WAS built), an
 * allowlisted family reaches the real garden and a non-allowlisted family sees nothing course-
 * shaped at all, only the "coming soon" message — never a login wall, never a partial/broken
 * render, and critically never the garden itself. `me.courseAllowed` is the only thing that
 * differs between the two tests below.
 */
test.describe('WO-C1 — production gate: build flag off, per-family allowlist', () => {
  test('courseAllowed: true -> the real garden renders (flag-off does not hide it)', async ({ page }) => {
    await mockCourseBackend(page, true);
    await page.goto('/course/');
    await page.getByRole('button', { name: /プロフィール 1/ }).click();
    await expect(page.getByRole('heading', { name: 'ナゼホリの にわ' })).toBeVisible();
  });

  test('courseAllowed: false -> "coming soon" only, never the garden or a profile picker', async ({ page }) => {
    await mockCourseBackend(page, false);
    await page.goto('/course/');
    await expect(page.getByText('この コースは、いま じゅんび中です。')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ナゼホリの にわ' })).not.toBeVisible();
    await expect(page.getByText('だれが つかいますか？')).not.toBeVisible();
  });
});

/**
 * WO-C2 §10: "an e2e test walks c01 at 390x844 (phone), 820x1180 (iPad portrait), 1180x820 (iPad
 * landscape); the Founder checks it on his iPad in Safari." c01 stays behind `review.philosophy`/
 * `.japanese` still null, so this walkthrough only exercises the PREVIEW path (courseAllowed:
 * true, レビュー中 badge showing) — matching how c01 is actually reachable today; real production
 * visibility is gated separately (scripts/gate-course-review-approved.ts's own `RELEASE=1` check).
 * One screenshot per screen the 8-step flow visits, per viewport — attached for the Founder's own
 * review rather than asserted on pixel-for-pixel (no baseline exists yet for lesson 1's real art).
 */
const VIEWPORTS: { label: string; width: number; height: number }[] = [
  { label: 'phone-390x844', width: 390, height: 844 },
  { label: 'ipad-portrait-820x1180', width: 820, height: 1180 },
  { label: 'ipad-landscape-1180x820', width: 1180, height: 820 },
];

for (const viewport of VIEWPORTS) {
  test(`WO-C2 c01 walkthrough + screenshots — ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockCourseBackend(page, true);
    await page.goto('/course/');
    await page.getByRole('button', { name: /プロフィール 1/ }).click();
    await expect(page.getByRole('heading', { name: 'ナゼホリの にわ' })).toBeVisible();

    // c01 is the first lesson flower (index 1, right after the Playground) — always unlocked
    // regardless of Playground progress isn't guaranteed, so open it via the parent's early
    // unlock instead of depending on Playground completion state in this fixture.
    await page.getByRole('button', { name: 'おうちの 人 へ' }).click();
    const earlyUnlock = page.getByRole('button', { name: 'はやく ひらく' }).first();
    if (await earlyUnlock.isVisible().catch(() => false)) await earlyUnlock.click();
    await page.getByRole('button', { name: 'もどる' }).click();
    await page.getByRole('button', { name: /ふたを あける/ }).click();

    await expect(page.getByText('レビュー中')).toBeVisible();
    await page.screenshot({ path: `test-results/wo-c2-${viewport.label}-lesson-hub.png`, fullPage: true });

    await page.getByRole('button', { name: 'きく A' }).click();
    await page.screenshot({ path: `test-results/wo-c2-${viewport.label}-listen-a.png`, fullPage: true });
    await finishListening(page);

    await page.getByRole('button', { name: /えらぶ A/ }).click();
    await page.screenshot({ path: `test-results/wo-c2-${viewport.label}-practice-a.png`, fullPage: true });
    for (let i = 0; i < 5; i++) await solvePracticeItem(page);

    await page.getByRole('button', { name: 'きく B' }).click();
    await finishListening(page);
    await page.getByRole('button', { name: /えらぶ B/ }).click();
    for (let i = 0; i < 5; i++) await solvePracticeItem(page);

    await page.getByRole('button', { name: 'つくる', exact: true }).click();
    await page.screenshot({ path: `test-results/wo-c2-${viewport.label}-make.png`, fullPage: true });
    await page.getByRole('button', { name: 'いってみた！' }).click();
    await page.getByRole('button', { name: /つぎへ|レッスンに もどる/ }).click();
    await page.getByRole('button', { name: 'いってみた！' }).click();
    await page.getByRole('button', { name: /つぎへ|レッスンに もどる/ }).click();

    await page.getByRole('button', { name: 'つたえる' }).click();
    await page.screenshot({ path: `test-results/wo-c2-${viewport.label}-teachback.png`, fullPage: true });
    await page.getByRole('button', { name: 'いえた！' }).click();
    await page.getByRole('button', { name: 'つぎへ' }).click();

    await page.getByRole('button', { name: 'かぞくで しらべる' }).click();
    await page.screenshot({ path: `test-results/wo-c2-${viewport.label}-family.png`, fullPage: true });
  });
}
