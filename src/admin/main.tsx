// kodomo-ai-admin dashboard entry (AD-16 §8) — built separately (vite.admin.config.ts), served
// only by backend/server/adminIndex.ts, behind IAP.
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';

createRoot(document.getElementById('root')!).render(<AdminApp />);
