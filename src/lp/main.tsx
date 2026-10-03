// Landing page entry (/).
import { createRoot } from 'react-dom/client';
import { LandingPage } from './LandingPage';
import { NewLandingPage } from './NewLandingPage';

// COPY-01: the new (post-launch) copy goes live here the same moment BEGINNER_LAUNCH does — see
// NewLandingPage.tsx's own doc comment. Until then this stays false in every real deploy (no
// VITE_BEGINNER_LAUNCH build arg is set in ci.yml/Dockerfile.frontend today), so this branch is
// dead code in production, same as every other BEGINNER_LAUNCH-gated frontend entry in this repo.
const BEGINNER_LAUNCH = import.meta.env.VITE_BEGINNER_LAUNCH === '1';

// WO-C7 item 1 (Founder, 3 Oct 2026): index.html's own static <title> can't be flag-gated (it's
// baked at build time, same for every deploy regardless of VITE_BEGINNER_LAUNCH) — this sets the
// real post-launch title the moment the new page itself goes live, never a moment before.
if (BEGINNER_LAUNCH) {
  document.title = 'ナゼホリ 入門コース — 家族で育てる「もう一問」の力';
}

createRoot(document.getElementById('root')!).render(BEGINNER_LAUNCH ? <NewLandingPage /> : <LandingPage />);
