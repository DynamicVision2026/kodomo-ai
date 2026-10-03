// Landing page entry (/).
import { createRoot } from 'react-dom/client';
import { LandingPage } from './LandingPage';
import { NewLandingPage } from './NewLandingPage';
import { BEGINNER_LAUNCH_TITLE } from './meta';

// COPY-01: the new (post-launch) copy goes live here the same moment BEGINNER_LAUNCH does — see
// NewLandingPage.tsx's own doc comment.
const BEGINNER_LAUNCH = import.meta.env.VITE_BEGINNER_LAUNCH === '1';

// scripts/prerender-legal.ts already patches dist/index.html's STATIC <title> to this same
// string at build time when the flag is on (so a no-JS fetch sees it immediately) — this
// override here is a second line of defense for a browser whose cached copy of "/" predates the
// flip, same reasoning as the static patch, never a competing source of truth for the string.
if (BEGINNER_LAUNCH) {
  document.title = BEGINNER_LAUNCH_TITLE;
}

createRoot(document.getElementById('root')!).render(BEGINNER_LAUNCH ? <NewLandingPage /> : <LandingPage />);
