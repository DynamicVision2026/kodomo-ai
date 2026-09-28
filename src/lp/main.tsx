// Landing page entry (/).
import { createRoot } from 'react-dom/client';
import { LandingPage } from './LandingPage';
import { NewLandingPage } from './NewLandingPage';

// COPY-01: the new (post-launch) copy goes live here the same moment BEGINNER_LAUNCH does — see
// NewLandingPage.tsx's own doc comment. Until then this stays false in every real deploy (no
// VITE_BEGINNER_LAUNCH build arg is set in ci.yml/Dockerfile.frontend today), so this branch is
// dead code in production, same as every other BEGINNER_LAUNCH-gated frontend entry in this repo.
const BEGINNER_LAUNCH = import.meta.env.VITE_BEGINNER_LAUNCH === '1';

createRoot(document.getElementById('root')!).render(BEGINNER_LAUNCH ? <NewLandingPage /> : <LandingPage />);
