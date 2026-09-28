// COPY-01: hidden preview entry (/lp-new/, noindex — see lp-new/index.html). Always renders the
// new copy regardless of VITE_BEGINNER_LAUNCH, so the Founder can review it before launch — the
// real "/" route (src/lp/main.tsx) is the one that stays flag-gated.
import { createRoot } from 'react-dom/client';
import { NewLandingPage } from './NewLandingPage';

createRoot(document.getElementById('root')!).render(<NewLandingPage />);
