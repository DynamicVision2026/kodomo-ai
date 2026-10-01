/**
 * Course redesign (Founder, 1 Oct 2026): real character art from the marketing design pack
 * (src/lp/assets/svg/, already the source of truth for both landing pages — see
 * src/lp/NewLandingPage.tsx's own doc comment) in place of the course's placeholder-free screens.
 * Plain Vite asset-URL imports, same technique NewLandingPage.tsx/LandingPage.tsx already use for
 * these exact files — never inlined/`?raw` (unlike the tool-icon sprite), since nothing here needs
 * `<use href>` id-targeting.
 */
export { default as hatenaQuestionUrl } from '../lp/assets/svg/hatena_question.svg';
export { default as hatenaDiscoveryUrl } from '../lp/assets/svg/hatena_discovery.svg';
export { default as pontaStandingUrl } from '../lp/assets/svg/ponta_standing.svg';
export { default as pontaTabletUrl } from '../lp/assets/svg/ponta_tablet.svg';
