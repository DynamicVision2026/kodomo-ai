import { test, expect, type Page } from '@playwright/test';

/**
 * WO-C6 A3: real-playback coverage (no audio mocks, real mp3, a genuine Playwright click as the
 * user gesture) for every place the beginner course plays sound, beyond b01's own repro in
 * e2e/listenRealAudio.spec.ts (kept as-is — the Founder's own original 20s/>15s recipe):
 *   - きく for all 7 lessons + the ending: press play, wait 15s, assert currentTime > 10 and the
 *     highlight has moved past line 2 (WO-C6 A3's own exact numbers).
 *   - れんしゅう b01-e01: tapping a card plays its reply clip through to its own `ended` event.
 *   - b07-e01: a chain plays each step's own distinctly-named audio file, not just step 0's.
 *   - チェック b01-k1: tapping a card plays its clip.
 *   - おうちで b01 (bonus, not in WO-C6's own A3 list): the home-challenge audio this push wired
 *     up for the first time actually plays — de-risks exactly the code this push added.
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

function allDoneBeginnerProgress() {
  const lessonIds = ['b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07'];
  const lessons: Record<string, unknown> = {};
  for (const id of lessonIds) {
    lessons[id] = {
      listenADone: true,
      exercisesDone: [...Array.from({ length: 5 }, (_, i) => `${id}-e${String(i + 1).padStart(2, '0')}`), 'k1', 'k2', 'k3', 'k4'],
      makeADone: false, makeBDone: false, teachBackDone: false,
      stars: 0, lastStepAt: new Date(0).toISOString(),
    };
  }
  return { schemaVersion: 1, rev: 0, updatedAt: new Date(0).toISOString(), lessons, earlyUnlockedParts: [], sixtyPercentNoticeShown: [] };
}

/** WO-C5's own lesson gating (src/course/progress.ts's `isPartUnlocked`): lesson N only opens
 *  once lesson N-1 is at 100%. To reach b02-b07's own きく screen for a real-playback test, every
 *  EARLIER lesson (never the lesson under test itself) needs to already be fully done. */
function progressUpTo(lessonIndex: number) {
  const lessonIds = ['b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07'];
  const lessons: Record<string, unknown> = {};
  for (const id of lessonIds.slice(0, lessonIndex)) {
    lessons[id] = {
      listenADone: true,
      exercisesDone: [...Array.from({ length: 5 }, (_, i) => `${id}-e${String(i + 1).padStart(2, '0')}`), 'k1', 'k2', 'k3', 'k4'],
      makeADone: false, makeBDone: false, teachBackDone: false,
      stars: 0, lastStepAt: new Date(0).toISOString(),
    };
  }
  return { schemaVersion: 1, rev: 0, updatedAt: new Date(0).toISOString(), lessons, earlyUnlockedParts: [], sixtyPercentNoticeShown: [] };
}

async function mockBeginnerBackend(page: Page, progress?: unknown) {
  // Only the family-account API is mocked — /audio/* is never routed here, so every audio
  // request hits the real static file this same preview server serves, exactly as production
  // does (backend/server/frontendIndex.ts serves dist/ verbatim, no rewrite for static assets).
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: meResponse() }));
  await page.route('**/api/v1/profiles/p1/course-progress/beginner', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: progress ?? emptyBeginnerProgress() });
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { schemaVersion: 1, rev: 1, updatedAt: new Date().toISOString(), ...body } });
  });
}

/** Same "seek the scrub to its own max, since we don't want a real wait here" technique as
 *  e2e/beginnerCourse.spec.ts's own `finishListening` — used only to REACH a later step quickly
 *  in tests that aren't themselves testing きく playback. */
async function finishListening(page: Page) {
  const scrub = page.locator('.course-listen__scrub-input');
  await expect(scrub).toBeVisible();
  await scrub.evaluate((el: HTMLInputElement) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    nativeSetter.call(el, el.max);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const toExercise = page.getByRole('button', { name: 'れんしゅうへ' });
  await expect(toExercise).toBeEnabled();
  await toExercise.click();
}

/** Garden tile label for each lesson (`courseUi.toolLabels[tool].label`, WO-C5's own garden tap
 *  target) — b01's own is the Founder's original repro target in listenRealAudio.spec.ts. */
const LESSONS = [
  { id: 'b01', label: 'ふたを あける' },
  { id: 'b02', label: 'まえの りゆうを 見る' },
  { id: 'b03', label: 'はみだしを さがす' },
  { id: 'b04', label: 'ひとつ けして かく' },
  { id: 'b05', label: 'ふみ台を 見る' },
  { id: 'b06', label: 'むこうに すわる' },
  { id: 'b07', label: 'もう 一問' },
];

async function assertListenPlaysPastLine2(page: Page) {
  test.setTimeout(30_000);
  // ListenScreen/EndingScreen each mount their OWN <audio> (a real DOM ref, unrelated to the
  // shared queued-clip singleton courseAudioPlayer.ts also keeps in the DOM, already unlocked by
  // the lesson-hub tap that navigated here) — excluded by its own marker attribute.
  const audio = page.locator('audio:not([data-shared-audio-player])');
  await expect(audio).toHaveCount(1);

  // A real, trusted Chromium click — satisfies the browser's autoplay-gesture requirement the
  // same way a real tap does; never a synthetic/mocked play().
  await page.getByRole('button', { name: /^きく/ }).click();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused), { timeout: 5000 }).toBe(false);

  // WO-C6 A3's own exact numbers: wait 15s, assert currentTime > 10, past line 2.
  await page.waitForTimeout(15_000);
  const currentTime = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(currentTime).toBeGreaterThan(10);

  const currentIndex = await page.locator('.course-listen__line').evaluateAll((els) =>
    els.findIndex((el) => el.classList.contains('course-listen__line--current')),
  );
  expect(currentIndex).toBeGreaterThanOrEqual(2);
}

LESSONS.forEach(({ id, label }, index) => {
  test(`${id} きく: real audio (no mocks) plays past line 2 within 15s`, async ({ page }) => {
    await mockBeginnerBackend(page, progressUpTo(index));
    await page.goto('/course/beginner/');
    await page.getByRole('button', { name: /たぬき/ }).click();
    await page.getByText(label, { exact: true }).click();
    await page.getByRole('button', { name: /^きく/ }).click();
    await assertListenPlaysPastLine2(page);
  });
});

test('b-ending さいごのページ: real audio (no mocks) plays past line 2 within 15s', async ({ page }) => {
  await mockBeginnerBackend(page, allDoneBeginnerProgress());
  await page.goto('/course/beginner/');
  await page.getByRole('button', { name: /たぬき/ }).click();
  await page.getByText('さいごのページ').click();
  await assertListenPlaysPastLine2(page);
});

test('れんしゅう b01-e01: tapping a card plays its reply clip through to its own ended event', async ({ page }) => {
  test.setTimeout(45_000);
  await mockBeginnerBackend(page);
  await page.goto('/course/beginner/');
  await page.getByRole('button', { name: /たぬき/ }).click();
  await page.getByText('ふたを あける', { exact: true }).click();
  await page.getByRole('button', { name: /^きく/ }).click();
  await finishListening(page);
  await page.getByRole('button', { name: /れんしゅう/ }).click();

  const audio = page.locator('audio[data-shared-audio-player]');
  // b01-e01's every option is `kind: 'question'` (real content), so tapping one queues
  // [ask, reply, feedback] — the reply clip has genuinely played to its end once the SECOND
  // `ended` fires on the shared element (the first is the ask clip's own end).
  await audio.evaluate((el: HTMLAudioElement) => {
    (window as unknown as { __endedCount: number }).__endedCount = 0;
    el.addEventListener('ended', () => {
      (window as unknown as { __endedCount: number }).__endedCount += 1;
    });
  });

  const options = page.locator('.course-exercise__options button:not([disabled])');
  await expect(options.first()).toBeVisible();
  await options.first().click();

  await expect.poll(
    () => page.evaluate(() => (window as unknown as { __endedCount: number }).__endedCount),
    { timeout: 30_000 },
  ).toBeGreaterThanOrEqual(2);
});

test('b07-e01: a chain plays each step\'s own distinctly-named audio file', async ({ page }) => {
  test.setTimeout(60_000);
  await mockBeginnerBackend(page, progressUpTo(6));
  await page.goto('/course/beginner/');
  await page.getByRole('button', { name: /たぬき/ }).click();
  await page.getByText('もう 一問', { exact: true }).click();
  await page.getByRole('button', { name: /^きく/ }).click();
  await finishListening(page);
  await page.getByRole('button', { name: /れんしゅう/ }).click();

  const audio = page.locator('audio[data-shared-audio-player]');
  const nextButton = page.getByRole('button', { name: 'つぎへ', exact: true });

  // Step 0's own reply/feedback files are unprefixed (audioPaths.ts's own `chainStepInfix(0)`).
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await nextButton.isVisible().catch(() => false)) break;
    const options = page.locator('.course-exercise__options button:not([disabled])');
    const count = await options.count();
    if (count === 0) break;
    await options.nth(attempt % count).click();
    const retry = page.getByRole('button', { name: 'もう一回えらぶ' });
    if (await retry.isVisible({ timeout: 1500 }).catch(() => false)) await retry.click();
  }
  await expect(nextButton).toBeVisible();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.src), { timeout: 15_000 })
    .toMatch(/b07_e01_[a-z]+_(reply|feedback)\.mp3$/);

  // Advancing to step 1 queues that step's own `_s1_`-prefixed files (chainStepInfix(1)) — a
  // distinct, separately-recorded file, never step 0's reused.
  await nextButton.click();
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await nextButton.isVisible().catch(() => false)) break;
    const options = page.locator('.course-exercise__options button:not([disabled])');
    const count = await options.count();
    if (count === 0) break;
    await options.nth(attempt % count).click();
    const retry = page.getByRole('button', { name: 'もう一回えらぶ' });
    if (await retry.isVisible({ timeout: 1500 }).catch(() => false)) await retry.click();
  }
  await expect(nextButton).toBeVisible();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.src), { timeout: 15_000 })
    .toMatch(/b07_e01_s1_[a-z]+_(reply|feedback)\.mp3$/);
});

test('チェック b01-k1: tapping a card plays its clip', async ({ page }) => {
  test.setTimeout(45_000);
  await mockBeginnerBackend(page);
  await page.goto('/course/beginner/');
  await page.getByRole('button', { name: /たぬき/ }).click();
  await page.getByText('ふたを あける', { exact: true }).click();
  await page.getByRole('button', { name: /^きく/ }).click();
  await finishListening(page);
  await page.getByRole('button', { name: /れんしゅう/ }).click();
  for (let i = 0; i < 5; i++) {
    const nextButton = page.getByRole('button', { name: 'つぎへ', exact: true });
    const options = page.locator('.course-exercise__options button:not([disabled])');
    for (let attempt = 0; attempt < 10 && !(await nextButton.isVisible().catch(() => false)); attempt++) {
      const count = await options.count();
      if (count === 0) break;
      await options.nth(attempt % count).click();
      const retry = page.getByRole('button', { name: 'もう一回えらぶ' });
      if (await retry.isVisible({ timeout: 1500 }).catch(() => false)) await retry.click();
    }
    await nextButton.click();
    if (await nextButton.isVisible({ timeout: 1000 }).catch(() => false)) await nextButton.click();
  }
  await page.getByRole('button', { name: /チェック/ }).click();

  const audio = page.locator('audio[data-shared-audio-player]');
  await audio.evaluate((el: HTMLAudioElement) => {
    (window as unknown as { __endedCount: number }).__endedCount = 0;
    el.addEventListener('ended', () => {
      (window as unknown as { __endedCount: number }).__endedCount += 1;
    });
  });

  const cards = page.locator('.course-exercise__options button');
  await expect(cards.first()).toBeVisible();
  await cards.first().click();

  // b01-k1's cards queue [card audio, feedback audio] — at least 1 `ended` proves that clip
  // genuinely played, not just that the DOM updated.
  await expect.poll(
    () => page.evaluate(() => (window as unknown as { __endedCount: number }).__endedCount),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(1);
});

test('おうちで b01: the newly-wired home-challenge audio actually plays', async ({ page }) => {
  test.setTimeout(30_000);
  await mockBeginnerBackend(page);
  await page.goto('/course/beginner/');
  await page.getByRole('button', { name: /たぬき/ }).click();
  await page.getByText('ふたを あける', { exact: true }).click();
  await page.getByRole('button', { name: /^きく/ }).click();
  await finishListening(page);
  await page.getByRole('button', { name: /れんしゅう/ }).click();
  for (let i = 0; i < 5; i++) {
    const nextButton = page.getByRole('button', { name: 'つぎへ', exact: true });
    const options = page.locator('.course-exercise__options button:not([disabled])');
    for (let attempt = 0; attempt < 10 && !(await nextButton.isVisible().catch(() => false)); attempt++) {
      const count = await options.count();
      if (count === 0) break;
      await options.nth(attempt % count).click();
      const retry = page.getByRole('button', { name: 'もう一回えらぶ' });
      if (await retry.isVisible({ timeout: 1500 }).catch(() => false)) await retry.click();
    }
    await nextButton.click();
    if (await nextButton.isVisible({ timeout: 1000 }).catch(() => false)) await nextButton.click();
  }
  await page.getByRole('button', { name: /チェック/ }).click();
  for (let i = 0; i < 4; i++) {
    const nextButton = page.getByRole('button', { name: 'つぎへ', exact: true });
    for (let attempt = 0; attempt < 5 && !(await page.getByText('できた！', { exact: true }).isVisible().catch(() => false)); attempt++) {
      const cards = page.locator('.course-exercise__options button');
      const count = await cards.count();
      if (count === 0) break;
      await cards.nth(attempt % count).click();
      const retry = page.getByRole('button', { name: 'もう一回えらぶ' });
      if (await retry.isVisible({ timeout: 1500 }).catch(() => false)) await retry.click();
    }
    await nextButton.click();
    if (await nextButton.isVisible({ timeout: 1000 }).catch(() => false)) await nextButton.click();
  }
  await page.getByRole('button', { name: /^おうちで/ }).click();

  const audio = page.locator('audio[data-shared-audio-player]');
  await expect(audio).toHaveCount(1);
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused), { timeout: 5000 }).toBe(false);
  await page.waitForTimeout(2000);
  const currentTime = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(currentTime).toBeGreaterThan(0);
});
