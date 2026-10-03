// WO-C7 item 9: hidden preview entry (/legal/tokushoho-preview/, noindex — see this route's own
// index.html). Always renders the v3 rows regardless of VITE_BEGINNER_LAUNCH, so a reviewer (or
// KOMOJU) can see the final text before the flip — the real /legal/tokushoho/ route
// (src/legal/tokushoho/main.tsx) is the one that stays flag-gated.
import { createRoot } from 'react-dom/client';
import { TokushohoPreviewPage } from './TokushohoPage';

createRoot(document.getElementById('root')!).render(<TokushohoPreviewPage />);
