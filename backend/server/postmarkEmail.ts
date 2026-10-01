import type { EmailMessage, EmailSender } from '../src/email.js';

/**
 * AD-13 §4: Postmark, transactional-only, tracking off. `EMAIL_API_KEY` is the server token
 * (Secret Manager); `from` must be an address on the dedicated sending subdomain (e.g.
 * no-reply@domo-ai.com) with SPF/DKIM/DMARC aligned there — neither of those DNS/account steps is
 * something this code can do; see the launch blockers list. `fromName` and `replyTo` are both
 * optional (e.g. display name 「ナゼホリ」, reply-to info@domo-ai.com) — Postmark's own `From`
 * field accepts the `"Name" <email>` form directly, and a bare `from` still works unchanged when
 * no display name is configured.
 */
export class PostmarkEmailSender implements EmailSender {
  constructor(
    private readonly apiToken: string,
    private readonly from: string,
    private readonly fromName?: string,
    private readonly replyTo?: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': this.apiToken,
      },
      body: JSON.stringify({
        From: this.fromName ? `"${this.fromName}" <${this.from}>` : this.from,
        ...(this.replyTo ? { ReplyTo: this.replyTo } : {}),
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        ...(message.html ? { HtmlBody: message.html } : {}),
        MessageStream: 'outbound',
        TrackOpens: false,
        TrackLinks: 'None',
      }),
    });
    if (!res.ok) {
      throw new Error(`Postmark send failed: ${res.status} ${await res.text()}`);
    }
  }
}
