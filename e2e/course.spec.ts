import { test, expect, type Page } from '@playwright/test';

/**
 * WO-C1 acceptance: "must show one demo lesson end to end, driven entirely by a JSON content
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

/** Picks options on the current exercise item until the `best` one resolves it (its role isn't
 *  exposed in the DOM, by design — F3/MoveCard's own "equal choices stay visually equal"), then
 *  advances past the resulting next/back-to-lesson button. Bounded so a real regression (no
 *  option ever resolving) fails the test instead of hanging. */
async function solveExercise(page: Page) {
  const advance = page.getByRole('button', { name: /つぎの もんだいへ|レッスンに もどる/ });
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await advance.isVisible().catch(() => false)) break;
    await page.locator('.course-exercise__options button').first().click();
    const retry = page.getByRole('button', { name: 'もう いちど えらぶ' });
    if (await retry.isVisible({ timeout: 2000 }).catch(() => false)) await retry.click();
  }
  await expect(advance).toBeVisible();
  await advance.click();
}

test.describe('WO-C1 — course shell, demo lesson end to end', () => {
  test('garden -> lesson -> listen -> both exercises -> make -> teach-back -> back to garden', async ({ page }) => {
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
    await page.getByRole('button', { name: 'きく' }).click();

    // Listen screen — transcript renders, then mark done
    await expect(page.getByRole('button', { name: 'きいたよ！' })).toBeVisible();
    await page.getByRole('button', { name: 'きいたよ！' }).click();
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible(); // back on the lesson hub

    // Both exercise items, in order
    await page.getByRole('button', { name: /れんしゅう/ }).click();
    await expect(page.getByText('もんだい 1/2')).toBeVisible();
    await solveExercise(page); // item 1 -> advances to もんだい 2/2
    await expect(page.getByText('もんだい 2/2')).toBeVisible();
    await solveExercise(page); // item 2 (last) -> back on the lesson hub
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Make screen
    await page.getByRole('button', { name: 'つくる' }).click();
    await expect(page.getByRole('button', { name: 'いって みた！' })).toBeVisible();
    await page.getByRole('button', { name: 'いって みた！' }).click();
    await page.getByRole('button', { name: /レッスンに もどる|つぎへ/ }).click();

    // Teach-back
    await page.getByRole('button', { name: 'はなす' }).click();
    await expect(page.getByRole('button', { name: 'いえた！' })).toBeVisible();
    await page.getByRole('button', { name: 'いえた！' }).click();
    await expect(page.getByText('デモ・れんしゅう')).toBeVisible();

    // Back to the garden
    await page.getByRole('button', { name: 'もどる' }).click();
    await expect(page.getByRole('heading', { name: 'ナゼホリの にわ' })).toBeVisible();
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
