// Printable deck entry (/print/deck). Renders from deck.s2.json via src/ui/Card.tsx.
import { createRoot } from 'react-dom/client';
import { PrintDeck } from './PrintDeck';

createRoot(document.getElementById('root')!).render(<PrintDeck />);
