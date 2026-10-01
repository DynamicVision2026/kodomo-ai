/**
 * AD-13 §4: the transactional emails a Family Account sends, plus the (pluggable) sender
 * interface — `backend/server/postmarkEmail.ts` is the real HTTP client (Postmark, AD-13's own
 * recommendation), `FakeEmailSender` below is what every test and local dev without
 * `EMAIL_API_KEY` uses instead, mirroring this repo's existing KV/Firestore split (real client in
 * backend/server/, a fake with the same interface everywhere else).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Email-redesign (Founder, 1 Oct 2026): the design-pack HTML body, additive to `text` — every
   *  sender must still send `text` as a true plain-text alternative (no HTML-only email), so this
   *  is optional and only set by the templates the Founder's design pack actually covers (the
   *  login-code and activation/claim emails) below. */
  html?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Records every message instead of sending it — used by every unit test, and by local dev when
 *  `EMAIL_API_KEY` isn't configured (logged instead, so a developer can still read the OTP). */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class LoggingEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.warn(`[email] EMAIL_API_KEY not configured — would have sent to ${message.to}:\n${message.text}`);
  }
}

/**
 * Email-redesign (Founder, 1 Oct 2026): email-safe HTML, per the nazehori-tokens.css design pack.
 * Table layout + inline CSS (no reliance on a `<style>` block for anything but the best-effort
 * dark-mode overrides — Gmail and others strip `<style>` entirely), literal hex values mirroring
 * the token file (no `var()` — unsupported in email), system Japanese font stack (no web font),
 * no SVG (Gmail strips it — `hatena_question.svg` is exported to a hosted PNG instead, see
 * scripts/export-email-assets.ts), and no tracking pixel (Postmark already sends with
 * TrackOpens:false/TrackLinks:'None' — this template must never reintroduce one of its own).
 */
const EMAIL_FONT_STACK = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic Medium","Yu Gothic",Meiryo,sans-serif';

/** Best-effort only: there is no way to guarantee dark-mode rendering across every mail client,
 *  only to follow the two realistic, industry-standard levers (the color-scheme meta tags, and a
 *  `prefers-color-scheme` media query) and keep the light-mode version fully legible on its own. */
function emailOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** Attribute values here are always either a URL this backend itself built (`loginUrl`/
 *  `claimUrl`) or a plain code/label string — never third-party input — but `&` still needs
 *  escaping to keep the markup itself valid wherever a query string carries one. */
function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function emailButtonHtml(href: string, label: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px auto;"><tr>` +
    `<td style="border-radius:999px;background:#FFD23F;border-bottom:4px solid #D9A900;">` +
    `<a href="${escapeHtmlAttr(href)}" style="display:inline-block;padding:14px 32px;font-family:${EMAIL_FONT_STACK};` +
    `font-size:16px;font-weight:700;color:#1B1F3A;text-decoration:none;">${label}</a>` +
    `</td></tr></table>`
  );
}

function emailCodeBoxHtml(code: string): string {
  return (
    `<div style="background:#EEF0F4;border-radius:16px;padding:20px;text-align:center;margin:16px 0;">` +
    `<span style="font-size:34px;font-weight:900;letter-spacing:0.2em;color:#1B1F3A;font-family:${EMAIL_FONT_STACK};">${code}</span>` +
    `</div>`
  );
}

function renderEmailHtml(appBaseUrl: string, bodyHtml: string): string {
  const hatenaUrl = `${appBaseUrl}/email/hatena_question@2x.png`;
  const privacyUrl = `${appBaseUrl}/legal/privacy/`;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
@media (prefers-color-scheme: dark) {
  .nz-email-bg { background:#14172A !important; }
  .nz-email-card { background:#232738 !important; }
  /* Only the prose text flips - the yellow CTA button and the code box keep their own fixed
     light/ink colors in both modes (an un-scoped '.nz-email-card *' wildcard would also repaint
     THEIR backgrounds to the dark card color, hiding the button entirely). */
  .nz-email-body-text, .nz-email-body-text p { color:#F3F4F8 !important; }
  .nz-email-muted, .nz-email-muted * { color:#AEB1C7 !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:#EEF0F4;">
<div class="nz-email-bg" style="background:#EEF0F4;padding:24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background:#232849;border-radius:20px 20px 0 0;padding:20px 24px;text-align:center;">
<img src="${hatenaUrl}" width="36" height="36" alt="ハテナ" style="vertical-align:middle;margin-right:8px;border:0;display:inline-block;">
<span style="font-family:${EMAIL_FONT_STACK};font-size:20px;font-weight:700;color:#ffffff;vertical-align:middle;">ナゼホリ</span>
</td></tr>
<tr><td class="nz-email-card" style="background:#FFFFFF;border-radius:0 0 28px 28px;padding:32px 24px;">
<div class="nz-email-body-text" style="font-family:${EMAIL_FONT_STACK};color:#1B1F3A;font-size:15px;line-height:1.9;">
${bodyHtml}
</div>
</td></tr>
<tr><td style="padding:24px 24px 0;text-align:center;">
<p class="nz-email-muted" style="margin:0 0 6px;color:#5E6180;font-size:12px;font-family:${EMAIL_FONT_STACK};">info@domo-ai.com</p>
<p class="nz-email-muted" style="margin:0;color:#5E6180;font-size:12px;font-family:${EMAIL_FONT_STACK};"><a href="${privacyUrl}" style="color:#5E6180;">プライバシーポリシー</a></p>
</td></tr>
</table>
</td></tr></table>
</div>
</body>
</html>`;
}

/** AD-13 §4: "the code is in the subject so it shows on a phone's lock screen." `appBaseUrl`
 *  (e.g. `https://domo-ai.com`, no trailing slash — see backend/src/links.ts's `appBaseUrl`) is
 *  optional only so every existing call site that doesn't pass one keeps working: when omitted,
 *  the HTML body's image/privacy links fall back to same-origin-relative paths instead of a
 *  broken absolute URL. */
export function loginCodeEmail(to: string, code: string, appBaseUrl = ''): EmailMessage {
  const text = `ログインコードは ${code} です。10分間有効です。\n\nこのメールに心当たりがない場合は、何も操作せずそのまま破棄してください。`;
  const bodyHtml =
    `<p style="margin:0 0 4px;">ログインコードは以下の通りです。10分間有効です。</p>` +
    emailCodeBoxHtml(code) +
    `<p style="margin:16px 0 0;font-size:13px;color:#5E6180;">このメールに心当たりがない場合は、何も操作せずそのまま破棄してください。</p>`;
  return {
    to,
    subject: `ナゼホリ ログインコード：${code}`,
    text,
    html: renderEmailHtml(appBaseUrl, bodyHtml),
  };
}

/** AD-16 §7/§10: "Module 1 activated" — sent to the FAMILY ACCOUNT email (never the purchaser
 *  email directly; when binding was by token/email_match they're normally the same address, but
 *  the distinction matters for the mother/father scenario — see AD-16 §1's own example) right
 *  after the webhook grants the entitlement.
 *
 *  COPY-01 (28 Sep 2026, 酒井先生-reviewed): the naming-table retcon ("モジュール1" -> "入門コース")
 *  applies only once `beginnerLaunch` is true — the same "go live at the same moment as
 *  BEGINNER_LAUNCH, never before" rule every other COPY-01 surface follows. COPY-01 §5 didn't give
 *  this specific email new prose (only §5b's claim-flow email, below), so this is the minimal,
 *  unambiguous rename §1's naming table and §6's search-and-remove list both call for — flagged
 *  in this work order's own report for the Coordinator to confirm or replace with fuller copy. */
export function moduleActivatedEmail(to: string, loginUrl: string, beginnerLaunch: boolean): EmailMessage {
  if (beginnerLaunch) {
    const bodyHtml =
      `<p style="margin:0 0 16px;">このたびは、ナゼホリをご購入いただき、ありがとうございます。</p>` +
      `<p style="margin:0 0 4px;">入門コースがご利用いただけるようになりました。<br>以下のボタンからナゼホリを開き、ご購入時のメールアドレスでログインしてください。</p>` +
      emailButtonHtml(loginUrl, '学習を始める') +
      `<p style="margin:16px 0 0;font-size:13px;color:#5E6180;">ご不明な点は、info@domo-ai.com までお問い合わせください。</p>`;
    return {
      to,
      subject: '【ナゼホリ】入門コースがご利用いただけるようになりました',
      text:
        `このたびは、ナゼホリをご購入いただき、ありがとうございます。\n\n` +
        `入門コースがご利用いただけるようになりました。\n` +
        `以下のリンクからナゼホリを開き、ご購入時のメールアドレスでログインしてください。\n\n` +
        `${loginUrl}\n\n` +
        `ご不明な点は、info@domo-ai.com までお問い合わせください。`,
      html: renderEmailHtml(emailOrigin(loginUrl), bodyHtml),
    };
  }
  return {
    to,
    subject: 'ナゼホリ モジュール1が使えるようになりました',
    text: `ご購入ありがとうございます。モジュール1が使えるようになりました。以下のリンクからログインし、メールで届く確認コードを入力してください。\n\n${loginUrl}`,
  };
}

/** AD-16 §2/§7: sent to the PURCHASER email (contact information only, never assumed to be the
 *  account holder) when an order can't be bound by token or existing account email — opens
 *  `/claim`, which requires logging in as the family the purchase is FOR.
 *
 *  COPY-01 §5b's own copy ("ご購入のメール ... the link that connects the purchase to the family
 *  account") maps onto this flow specifically — "このリンクは、ご購入いただいた方専用です" is only
 *  true of the PURCHASER's own email, this function's actual recipient (moduleActivatedEmail's
 *  recipient is the family-account holder, who isn't always the purchaser — see its own doc
 *  comment), and "つなげてください" describes exactly what visiting `/claim` does: bind the order to
 *  a family account that doesn't have it yet. Gated on `beginnerLaunch` like every other COPY-01
 *  surface; `orderName` is unused in the new copy (not part of COPY-01's given text) but kept in
 *  the old branch below. */
export function claimYourPurchaseEmail(to: string, orderName: string, claimUrl: string, beginnerLaunch: boolean): EmailMessage {
  if (beginnerLaunch) {
    const bodyHtml =
      `<p style="margin:0 0 16px;">ナゼホリ入門コースをご購入いただき、ありがとうございます。</p>` +
      `<p style="margin:0 0 4px;">下のボタンから、ご家族のアカウントとつなげてください。<br>つなげると、入門コースの7つのレッスンがひらきます。</p>` +
      emailButtonHtml(claimUrl, '入門コースをひらく') +
      `<p style="margin:16px 0 0;font-size:13px;color:#5E6180;">このリンクは、ご購入いただいた方専用です。<br>ご不明な点は、info@domo-ai.com までお問い合わせください。</p>` +
      `<p style="margin:16px 0 0;font-size:13px;color:#5E6180;">ナゼホリ（Beyond Culture 獨歩文化株式会社）</p>`;
    return {
      to,
      subject: 'ナゼホリ入門コース｜ご購入ありがとうございます',
      text:
        `ナゼホリ入門コースをご購入いただき、ありがとうございます。\n\n` +
        `下のボタンから、ご家族のアカウントとつなげてください。\n` +
        `つなげると、入門コースの7つのレッスンがひらきます。\n\n` +
        `［入門コースをひらく］\n${claimUrl}\n\n` +
        `このリンクは、ご購入いただいた方専用です。\n` +
        `ご不明な点は、info@domo-ai.com までお問い合わせください。\n\n` +
        `ナゼホリ（Beyond Culture 獨歩文化株式会社）`,
      html: renderEmailHtml(emailOrigin(claimUrl), bodyHtml),
    };
  }
  return {
    to,
    subject: 'ナゼホリ ご購入の受け取り手続きのお願い',
    text:
      `ご注文${orderName}のお受け取り手続きをお願いします。お子さまが使っているアカウントのメール` +
      `アドレスでログインし、以下のリンクから受け取りを確定してください。\n\n${claimUrl}\n\n` +
      `まだアカウントをお持ちでない場合は、そのままログイン画面からメールアドレスを入力して` +
      `お進みください。`,
  };
}

/** AD-13 §3/§5: sent to the parent whenever the 6th login evicts the least-recently-used
 *  session — the replacement for the old manual "choose a device to remove" screen. */
export function deviceEvictedEmail(to: string, newDeviceLabel: string, evictedDeviceLabel: string): EmailMessage {
  return {
    to,
    subject: 'ナゼホリ 新しい端末からログインがありました',
    text:
      `新しい端末（${newDeviceLabel}）からログインがあったため、同時に使える端末の上限（5台）により、` +
      `最後に使われていなかった端末（${evictedDeviceLabel}）のログインを解除しました。` +
      `心当たりがない場合は、このメールにご返信ください。`,
  };
}

/** AD-13 §3 step 6: email change notifies both the old and new address. */
export function emailChangedEmail(to: string, otherAddress: string): EmailMessage {
  return {
    to,
    subject: 'ナゼホリ ログイン用メールアドレスが変更されました',
    text: `このアカウントのログイン用メールアドレスが ${otherAddress} に変更されました。心当たりがない場合は、このメールにご返信ください。`,
  };
}
