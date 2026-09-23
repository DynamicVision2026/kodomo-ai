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

/** AD-13 §4: "the code is in the subject so it shows on a phone's lock screen." */
export function loginCodeEmail(to: string, code: string): EmailMessage {
  return {
    to,
    subject: `ナゼホリ ログインコード：${code}`,
    text: `ログインコードは ${code} です。10分間有効です。\n\nこのメールに心当たりがない場合は、何も操作せずそのまま破棄してください。`,
  };
}

/** AD-13 §5 step 2: sent right after a webhook grants an entitlement, prefilling /login. */
export function welcomeEmail(to: string, loginUrl: string): EmailMessage {
  return {
    to,
    subject: 'ナゼホリ ご購入ありがとうございます',
    text: `ご購入ありがとうございます。以下のリンクからログインし、メールで届く確認コードを入力してください。\n\n${loginUrl}`,
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
