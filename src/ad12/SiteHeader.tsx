import { useEffect, useState } from 'react';
import { fetchMe, isFamilyApiConfigured, logout } from '../family/api';
import './site-header.css';

export interface SiteHeaderUi {
  brandLabel: string;
  playgroundLabel: string;
  courseLabel: string;
  accountLabel: string;
  logoutLabel: string;
}

export interface SiteHeaderProps {
  ui: SiteHeaderUi;
  /** Which surface this header is rendered on — decides which half of the brand/switcher is the
   *  current (plain-text) side and which is the link. */
  current: 'playground' | 'course';
  /** Where the brand label (`ui.brandLabel`) links — this surface's own home. */
  homeHref: string;
}

const BEGINNER_LAUNCH_BUILD_FLAG = import.meta.env.VITE_BEGINNER_LAUNCH === '1';

/**
 * Post-launch-check (Founder, domo-ai.com): a small header on Course Home / the beginner course
 * garden — ナゼホリ (brand, -> this surface's own home) · プレイグラウンド / 入門コース (switch)
 * · アカウント · ログアウト. Copy is a prop, never hardcoded here (gate:no-hardcoded-copy scans
 * both src/shell and src/course, the two directories this component is used from) — each caller
 * supplies its own JSON-sourced strings (module.json's `ui` block for the Playground,
 * courseUi.json for the course).
 *
 * Renders nothing at all when no real family-account backend is configured
 * (`isFamilyApiConfigured()`) — the same honest not-configured convention this whole account
 * system already uses everywhere else (src/family/api.ts). This is deliberate, not just a
 * fallback: it means local dev and the hundreds of existing MissionShell/CourseHome tests that
 * never stub `VITE_FAMILY_API_URL` render exactly as before, unchanged — there is no account
 * system for this header to link to in that case anyway.
 *
 * The course-switch half is only ever a link when the OTHER surface is actually reachable:
 * Playground -> course only once the beginner course is visible to this family (the same
 * `VITE_BEGINNER_LAUNCH === '1' || me.courseAllowed` rule `BeginnerCourseApp.tsx` itself gates
 * on — showing a dead link to a not-yet-launched feature would leak its existence early); the
 * course garden -> Playground link has no such gate, since the Playground is always reachable.
 */
export function SiteHeader({ ui, current, homeHref }: SiteHeaderProps) {
  const [courseVisible, setCourseVisible] = useState(BEGINNER_LAUNCH_BUILD_FLAG || current === 'course');

  useEffect(() => {
    if (courseVisible || !isFamilyApiConfigured()) return;
    let cancelled = false;
    fetchMe().then((me) => {
      if (!cancelled && me?.courseAllowed) setCourseVisible(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isFamilyApiConfigured()) return null;

  async function handleLogout() {
    await logout();
    window.location.href = '/';
  }

  return (
    <header className="ad12 site-header">
      <a className="site-header__brand" href={homeHref}>
        {ui.brandLabel}
      </a>
      <nav className="site-header__switch" aria-label={`${ui.playgroundLabel} / ${ui.courseLabel}`}>
        {current === 'playground' ? (
          <span className="site-header__switch-current">{ui.playgroundLabel}</span>
        ) : (
          <a className="site-header__switch-link" href="/play/">
            {ui.playgroundLabel}
          </a>
        )}
        {courseVisible && (
          <>
            <span aria-hidden="true" className="site-header__switch-divider">/</span>
            {current === 'course' ? (
              <span className="site-header__switch-current">{ui.courseLabel}</span>
            ) : (
              <a className="site-header__switch-link" href="/course/beginner/">
                {ui.courseLabel}
              </a>
            )}
          </>
        )}
      </nav>
      <a className="site-header__link" href="/account/">
        {ui.accountLabel}
      </a>
      <button type="button" className="site-header__link site-header__logout" onClick={handleLogout}>
        {ui.logoutLabel}
      </button>
    </header>
  );
}
