// Print Centre entry (/print/centre): WO-29 §H — the family's actual downloads page, opened from
// Course Home's existing 「いんさつキット」 button (src/shell/CourseHome.tsx's onOpenKit), which
// previously opened the raw /print/kit/ everything-at-once preview directly. That preview route
// is unchanged and still exists for internal use; this is the customer-facing utility page.
import { createRoot } from 'react-dom/client';
import { PrintCentre } from './PrintCentre';
import { homeKitPackage } from '../kit-data/homeKitPackage';
import ui from '../kit-data/print-centre-ui.json';

createRoot(document.getElementById('root')!).render(
  <PrintCentre ui={ui} pkg={homeKitPackage} baseUrl="/kit" />,
);
