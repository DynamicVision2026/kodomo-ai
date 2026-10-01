import { NOTICE_D_LEAD, NOTICE_D_PRIVACY_LINK_LABEL, NOTICE_D_PRIVACY_PREFIX, NOTICE_D_PRIVACY_SUFFIX } from './consentText';

/**
 * Notice D (Founder, 1 Oct 2026) — shown above every buy button, both on the landing page and on
 * /account/'s own 「購入手続きへ進む」, so a purchaser sees the login-consent requirement and its
 * refund guarantee BEFORE paying, not only after. Caller supplies the class name so each surface
 * keeps its own spacing/typography (parent text 14-15px per the Founder's own instruction).
 */
export function NoticeD({ className }: { className: string }) {
  return (
    <p className={className}>
      {NOTICE_D_LEAD}
      {NOTICE_D_PRIVACY_PREFIX}
      <a href="/legal/privacy/" target="_blank" rel="noopener noreferrer">{NOTICE_D_PRIVACY_LINK_LABEL}</a>
      {NOTICE_D_PRIVACY_SUFFIX}
    </p>
  );
}
