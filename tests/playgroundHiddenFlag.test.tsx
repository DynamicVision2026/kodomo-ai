/**
 * "Playground hidden; Lesson 1 is the free sample" (Founder, 2 Oct 2026) — the single
 * `VITE_PLAYGROUND_HIDDEN` build flag covered end to end:
 *  - beginnerLicence.ts: `isLessonAccessible`/`freeSampleLessonIds` on/off behavior.
 *  - BeginnerCourseHome: only b01 opens for an unlicensed family when the flag is on; a revoked
 *    licence (refund) still leaves b01 open; the flag OFF is byte-for-byte the pre-existing
 *    licensed-only behavior (item 6's own "nothing changes for live families" regression case).
 *  - SiteHeader: the プレイグラウンド switch link disappears once the flag hides it.
 *  - stage2 CourseHome (item 4): the Playground flower is dropped from the garden under the flag.
 *
 * Uses the same `vi.resetModules()` + `vi.stubEnv(...)` + dynamic `import()` idiom already
 * established for build-time flags in tests/LegalPages.test.tsx / tests/AccountPage.test.tsx /
 * tests/SiteHeader.test.tsx, since every one of these flags is read once, at module load, via a
 * local `import.meta.env.VITE_X === '1'` constant — never a runtime-togglable value.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeResponse } from '../src/family/api';
import type { CourseBeginnerLesson, CourseBeginnerManifest } from '../src/course/content/types';
import type { CourseLesson, CourseManifest } from '../src/course/content/types';
import { emptyCourseProgress } from '../src/course/progress';
import { BeginnerCourseHome } from '../src/course/screens/BeginnerCourseHome';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function fakeMe(entitled: boolean): MeResponse {
  return {
    familyId: 'f1',
    email: 'p***@example.com',
    entitlements: entitled ? [{ moduleId: 'm1', status: 'active', grantedAt: '2026-01-01T00:00:00.000Z' }] : [],
    profiles: [],
    trials: [],
    courseAllowed: false,
    consentRecorded: true,
  };
}

describe('beginnerLicence.ts — isLessonAccessible / freeSampleLessonIds', () => {
  it('flag off (unset, every real deploy to date): behavior is byte-for-byte the old licensed-only gate', async () => {
    vi.resetModules();
    const { isLessonAccessible, freeSampleLessonIds } = await import('../src/course/beginnerLicence');
    expect(isLessonAccessible(fakeMe(false), 'b01')).toBe(false);
    expect(isLessonAccessible(fakeMe(true), 'b01')).toBe(true);
    expect(isLessonAccessible(fakeMe(false), 'b02')).toBe(false);
    expect(freeSampleLessonIds()).toEqual([]);
  });

  it('flag on: b01 opens for an unlicensed family; every other lesson stays locked', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PLAYGROUND_HIDDEN', '1');
    const { isLessonAccessible, freeSampleLessonIds } = await import('../src/course/beginnerLicence');
    expect(isLessonAccessible(fakeMe(false), 'b01')).toBe(true);
    expect(isLessonAccessible(fakeMe(false), 'b02')).toBe(false);
    expect(isLessonAccessible(fakeMe(false), 'ending')).toBe(false);
    expect(freeSampleLessonIds()).toEqual(['b01']);
  });

  it('flag on, a refund (entitlement revoked / absent): b01 still opens — a refund never locks Lesson 1', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PLAYGROUND_HIDDEN', '1');
    const { isLessonAccessible } = await import('../src/course/beginnerLicence');
    const refunded: MeResponse = { ...fakeMe(true), entitlements: [{ moduleId: 'm1', status: 'revoked', grantedAt: '2026-01-01T00:00:00.000Z' }] };
    expect(isLessonAccessible(refunded, 'b01')).toBe(true);
    expect(isLessonAccessible(refunded, 'b02')).toBe(false);
  });

  it('flag on, an already-licensed family: every lesson stays open exactly as before, b01 included', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PLAYGROUND_HIDDEN', '1');
    const { isLessonAccessible } = await import('../src/course/beginnerLicence');
    expect(isLessonAccessible(fakeMe(true), 'b01')).toBe(true);
    expect(isLessonAccessible(fakeMe(true), 'b02')).toBe(true);
  });
});

function fakeBeginnerLesson(id: string): CourseBeginnerLesson {
  return {
    id,
    course: 'beginner',
    title: `title-${id}`,
    tool: 'A',
    listen: { tool: 'A', audio: 'a.mp3', methodCards: ['A'], transcript: [], thenExercises: [], toolCard: { when: '', how: '' } },
    exercises: [],
    audit: [],
    home: { title: 't', steps: [], wordHints: [], button: 'b', parentNote: 'n' },
    review: { model: 'pass', philosophy: null, japanese: null },
  };
}

function fakeBeginnerManifest(): CourseBeginnerManifest {
  return {
    courseId: 'beginner', title: 't', price: { yen: 4980, kind: 'm1', sku: 's' },
    parts: [{ id: 'b01', kind: 'lesson', tool: 'A' }, { id: 'b02', kind: 'lesson', tool: 'A' }],
    finalScreen: { line: '', sub: '' },
  };
}

describe('BeginnerCourseHome — item 6 acceptance: a logged-in family without a licence sees Lesson 1 open, Lessons 2-7 locked', () => {
  it('freeLessonIds=[\'b01\'] (flag on), unlicensed: b01 is tappable (no lock icon), b02 shows the lock icon and the purchase note on tap', async () => {
    const user = userEvent.setup();
    const onOpenLesson = vi.fn();
    render(
      <BeginnerCourseHome
        manifest={fakeBeginnerManifest()}
        progress={emptyCourseProgress()}
        licensed={false}
        freeLessonIds={['b01']}
        getLesson={(id) => fakeBeginnerLesson(id)}
        onOpenLesson={onOpenLesson}
        onOpenEnding={() => {}}
        onOpenParent={() => {}}
      />,
    );

    const flowers = document.querySelectorAll('.course-beginner-flower');
    expect(flowers).toHaveLength(2);
    expect(flowers[0]!.querySelector('.course-beginner-flower__lock')).toBeNull();
    expect(flowers[1]!.querySelector('.course-beginner-flower__lock')).not.toBeNull();

    await user.click(flowers[0]!.querySelector('button')!);
    expect(onOpenLesson).toHaveBeenCalledWith('b01');

    onOpenLesson.mockClear();
    await user.click(flowers[1]!.querySelector('button')!);
    expect(onOpenLesson).not.toHaveBeenCalled();
    expect(document.querySelector('.course-home__note')?.textContent).toBe('入門コースで、ひらこう');

    // The purchase CTA still shows at the bottom — only per-lesson accessibility changed, not the
    // overall licensed state, so the usual "buy to unlock" link is unaffected.
    expect(screen.getByRole('link', { name: '入門コースで、ひらこう' })).toHaveAttribute('href', '/account/?buy=1');
  });

  it('flag off (freeLessonIds=[], the default): unlicensed family sees every lesson locked, including b01 — byte-for-byte the pre-existing behavior', async () => {
    const onOpenLesson = vi.fn();
    render(
      <BeginnerCourseHome
        manifest={fakeBeginnerManifest()}
        progress={emptyCourseProgress()}
        licensed={false}
        getLesson={(id) => fakeBeginnerLesson(id)}
        onOpenLesson={onOpenLesson}
        onOpenEnding={() => {}}
        onOpenParent={() => {}}
      />,
    );
    const flowers = document.querySelectorAll('.course-beginner-flower');
    expect(flowers[0]!.querySelector('.course-beginner-flower__lock')).not.toBeNull();
    expect(flowers[1]!.querySelector('.course-beginner-flower__lock')).not.toBeNull();
  });

  it('a refund (licensed=false) with freeLessonIds=[\'b01\']: b01 stays open — a refund never locks Lesson 1', () => {
    render(
      <BeginnerCourseHome
        manifest={fakeBeginnerManifest()}
        progress={emptyCourseProgress()}
        licensed={false}
        freeLessonIds={['b01']}
        getLesson={(id) => fakeBeginnerLesson(id)}
        onOpenLesson={() => {}}
        onOpenEnding={() => {}}
        onOpenParent={() => {}}
      />,
    );
    const flowers = document.querySelectorAll('.course-beginner-flower');
    expect(flowers[0]!.querySelector('.course-beginner-flower__lock')).toBeNull();
  });
});

describe('SiteHeader — item 1: the プレイグラウンド switch link disappears once VITE_PLAYGROUND_HIDDEN=1', () => {
  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const UI = {
    brandLabel: 'ナゼホリ', playgroundLabel: 'プレイグラウンド', courseLabel: '入門コース',
    accountLabel: 'アカウント', logoutLabel: 'ログアウト',
  };

  it('on the course garden, with the flag on: no プレイグラウンド link, no divider, 入門コース is still the current surface', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubEnv('VITE_PLAYGROUND_HIDDEN', '1');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [], courseAllowed: true })));
    const { SiteHeader } = await import('../src/ad12/SiteHeader');
    render(<SiteHeader ui={UI} current="course" homeHref="/course/beginner/" />);

    expect(screen.queryByText('プレイグラウンド')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'プレイグラウンド' })).not.toBeInTheDocument();
    expect(document.querySelector('.site-header__switch-divider')).toBeNull();
    expect(screen.getByText('入門コース')).toBeInTheDocument();
  });
});

function fakeStage2Lesson(id: string): CourseLesson {
  return {
    id, title: `title-${id}`, tools: ['A'], practice: 'single',
    review: { model: 'pass', philosophy: null, japanese: null },
    listen: [{ tool: 'A', audio: 'a.mp3', transcript: [], methodCards: ['A'], thenExercises: [], toolCard: { when: '', how: '' } }],
    exercises: [], make: [], teachBack: { prompt: 'p' },
    family: { whoKnows: '', aiExample: '', applyTool: '', notes: [] },
    parentCard: { tool: '', method: '', sources: [], dinnerQuestion: '' },
  };
}

describe('stage2 CourseHome — item 4: the Playground flower is dropped from the garden under the flag', () => {
  const manifest: CourseManifest = {
    courseStage: 2,
    parts: [{ id: 'playground', kind: 'playground', missions: 8 }, { id: 'c01', kind: 'lesson' }],
  };

  it('flag on: only the lesson flower renders, never the Playground one', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PLAYGROUND_HIDDEN', '1');
    const { CourseHome } = await import('../src/course/screens/CourseHome');
    render(
      <CourseHome
        manifest={manifest}
        progress={emptyCourseProgress()}
        getLesson={(id) => (id === 'c01' ? fakeStage2Lesson('c01') : undefined)}
        playgroundStoryIds={['m1']}
        playgroundMissionDone={{}}
        onOpenPlayground={() => {}}
        onOpenLesson={() => {}}
        onOpenParent={() => {}}
        onOpenDemo={() => {}}
      />,
    );
    expect(document.querySelectorAll('.ad12-home-plane')).toHaveLength(1);
  });

  it('flag off (default): the Playground flower still renders first, exactly as before', async () => {
    vi.resetModules();
    const { CourseHome } = await import('../src/course/screens/CourseHome');
    render(
      <CourseHome
        manifest={manifest}
        progress={emptyCourseProgress()}
        getLesson={(id) => (id === 'c01' ? fakeStage2Lesson('c01') : undefined)}
        playgroundStoryIds={['m1']}
        playgroundMissionDone={{}}
        onOpenPlayground={() => {}}
        onOpenLesson={() => {}}
        onOpenParent={() => {}}
        onOpenDemo={() => {}}
      />,
    );
    expect(document.querySelectorAll('.ad12-home-plane')).toHaveLength(2);
  });
});
