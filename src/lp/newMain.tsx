// COPY-01: hidden preview entry (/lp-new/, noindex — see lp-new/index.html). Renders the new copy
// while VITE_BEGINNER_LAUNCH is off, so the Founder can review it before launch — the real "/"
// route (src/lp/main.tsx) is the one that actually flips.
//
// WO-C7 item 9 (Founder, 3 Oct 2026): once the flag IS on, "/" already shows this same page, so
// this preview route just redirects there instead of rendering a second, now-redundant copy.
import { createRoot } from 'react-dom/client';
import { NewLandingPage } from './NewLandingPage';

const BEGINNER_LAUNCH = import.meta.env.VITE_BEGINNER_LAUNCH === '1';

if (BEGINNER_LAUNCH) {
  window.location.replace('/nazehori/');
} else {
  createRoot(document.getElementById('root')!).render(<NewLandingPage />);
}
