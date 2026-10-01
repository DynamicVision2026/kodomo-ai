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
    return {
      to,
      subject: '【ナゼホリ】入門コースがご利用いただけるようになりました',
      text:
        `このたびは、ナゼホリをご購入いただき、ありがとうございます。\n\n` +
        `入門コースがご利用いただけるようになりました。\n` +
        `以下のリンクからナゼホリを開き、ご購入時のメールアドレスでログインしてください。\n\n` +
        `${loginUrl}\n\n` +
        `ご不明な点は、info@domo-ai.com までお問い合わせください。`,
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
