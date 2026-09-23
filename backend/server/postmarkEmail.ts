import type { EmailMessage, EmailSender } from '../src/email.js';

/**
 * AD-13 §4: Postmark, transactional-only, tracking off. `EMAIL_API_KEY` is the server token
 * (Secret Manager); `EMAIL_FROM` must be an address on the dedicated sending subdomain (e.g.
 * login@mail.<domain>) with SPF/DKIM/DMARC aligned there — neither of those DNS/account steps is
 * something this code can do; see the launch blockers list.
 */
export class PostmarkEmailSender implements EmailSender {
  constructor(
    private readonly apiToken: string,
    private readonly from: string,
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
        From: this.from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
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
