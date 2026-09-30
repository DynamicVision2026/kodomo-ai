import { test, expect, type Page } from '@playwright/test';

/**
 * Founder report (domo-ai.com, 30 Sep, re-tested after the #181 deploy): きく plays the first
 * transcript line, then the audio stops — reproduced on Mac Chrome, not just iPad Safari (28 Sep).
 * Root cause: ListenScreen.tsx's own `onTimeUpdate` handler called `seekTo()`, which re-assigns
 * `audio.currentTime = <the position that same event just reported>` on every single timeupdate
 * tick (several times a second). Constantly re-seeking a real, network-streamed MP3 to
 * approximately its own current position is not a no-op — each one forces the decoder to
 * re-locate the nearest frame near that byte offset, and in production (real HTTP audio, not an
 * instantly-available local blob) this compounds until the media pipeline stalls outright, which
 * reads to a family as "the audio stopped." Neither Chromium's mocked `HTMLMediaElement.play()`
 * (the unit-test suite) nor `finishListening()`'s scrub-cheat (the existing e2e walkthroughs,
 * e2e/course.spec.ts + e2e/beginnerCourse.spec.ts) ever exercises a real `timeupdate` loop against
 * a real audio file, which is exactly why this shipped unnoticed.
 *
 * This spec is the Founder's own repro recipe, kept permanent: real production build, the real
 * b01_listen.mp3 (no audio mock, no route interception on /audio/*), a genuine Chromium user-
 * gesture click on the real play button (never the scrub-bar cheat), a real 20s wall-clock wait,
 * then asserting real playback actually progressed.
 */
function meResponse() {
  return {
    familyId: 'fam_test',
    email: 'test@example.com',
    entitlements: [{ moduleId: 'm1', status: 'active', grantedAt: new Date(0).toISOString() }],
    profiles: [{ id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 }],
    trials: [],
    courseAllowed: true,
  };
}

function emptyBeginnerProgress() {
  return { schemaVersion: 1, rev: 0, updatedAt: new Date(0).toISOString(), lessons: {}, earlyUnlockedParts: [], sixtyPercentNoticeShown: [] };
}

async function mockBeginnerBackend(page: Page) {
  // Only the family-account API is mocked — /audio/* is never routed here, so every audio
  // request hits the real static file this same preview server serves, exactly as production
  // does (backend/server/frontendIndex.ts serves dist/ verbatim, no rewrite for static assets).
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: meResponse() }));
  await page.route('**/api/v1/profiles/p1/course-progress/beginner', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: emptyBeginnerProgress() });
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { schemaVersion: 1, rev: 1, updatedAt: new Date().toISOString(), ...body } });
  });
}

test('b01 きく: real audio (no mocks) keeps playing past the first transcript line', async ({ page }) => {
  test.setTimeout(45_000);

  await mockBeginnerBackend(page);
  await page.goto('/course/beginner/');
  await page.getByRole('button', { name: /プロフィール 1/ }).click();
  await page.getByText('ふたを あける').click();
  await page.getByRole('button', { name: 'きく', exact: true }).click();

  const audio = page.locator('audio');
  await expect(audio).toHaveCount(1);

  // A real, trusted Chromium click — Playwright's own click() satisfies the browser's
  // autoplay-gesture requirement the same way a real tap does; never a synthetic/mocked play().
  await page.getByRole('button', { name: 'きく', exact: true }).click();

  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused), { timeout: 5000 }).toBe(false);

  // Real wall-clock wait — this is the whole point: only real elapsed time against the real
  // streamed file can reproduce (or, once fixed, disprove) the production stall.
  await page.waitForTimeout(20_000);

  const currentTime = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(currentTime).toBeGreaterThan(15);

  // b01's own transcript (src/course/content/lessons/b01.lesson.json): line 0 starts at 0s, line
  // 1 at 3.76s, line 2 at 9.944s — 20s of real playback must be well past line 2's highlight.
  const currentIndex = await page.locator('.course-listen__line').evaluateAll((els) =>
    els.findIndex((el) => el.classList.contains('course-listen__line--current')),
  );
  expect(currentIndex).toBeGreaterThanOrEqual(2);
});
