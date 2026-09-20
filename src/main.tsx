// App entry (/play).
//
// WO-11: bread (m1-s2-1-1) and ice (m1-s2-1-2) are now contentClass: "archived" — no longer
// release curriculum, and, per WO-11 decision 5, must never be reachable from production. Their
// mission imports are removed from this entry point entirely (not just unused — gate:claims
// checks the real import graph under src/ and fails if an archived/synthetic topic is still
// referenced here). There is currently no release-classified mission anywhere in this
// repository ("0 release topics" is the correct post-migration state) — C-03「ちゃんと」is the
// next candidate but is explicitly out of scope for this ticket. This placeholder is
// deliberately minimal: it is not new child-facing product copy, just an honest reflection of
// "no release mission is wired in yet," until a real commissioned topic replaces it.
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <p style={{ fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
    No release mission is currently available.
  </p>,
);
