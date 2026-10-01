/**
 * Founder decision (1 Oct 2026), item 1 "EVIDENCE FIRST": Postmark deletes outbound-message
 * history after 45 days, so every message sent through it so far needs to be exported and saved
 * OUTSIDE Postmark before that window closes. Uses the same server token the backend itself sends
 * through (`EMAIL_API_KEY` — see backend/server/postmarkEmail.ts), read from the environment (in
 * CI: fetched from Secret Manager by the dispatching workflow, matching every other
 * workload_identity_provider-authenticated script in scripts/).
 *
 * Calls Postmark's own Outbound Messages API (GET /messages/outbound), paginating with
 * count/offset until a page comes back short, and writes ONE row per message: recipient
 * (Postmark's own `Recipients` field — exactly who it was sent to, nothing re-derived), the send
 * date, the subject (which doubles as "type" here — every template this codebase sends has its
 * own fixed subject, see backend/src/email.ts), and status. Never the message BODY — Founder
 * asked for "recipient, date, subject/type, status" only, and the body can carry a one-time login
 * code or a claim URL that's still live.
 *
 * Output: a single CSV, written to the path `--out` names (never committed to git by this script
 * itself — see .github/workflows/postmark-export.yml's own doc comment for why).
 */
import { writeFileSync } from 'node:fs';

interface PostmarkMessage {
  MessageID: string;
  To: string;
  Recipients: string[];
  ReceivedAt: string;
  Subject: string;
  Status: string;
  Tag?: string;
}

interface PostmarkOutboundResponse {
  TotalCount: number;
  Messages: PostmarkMessage[];
}

const PAGE_SIZE = 500;

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function fetchPage(token: string, offset: number): Promise<PostmarkOutboundResponse> {
  const res = await fetch(`https://api.postmarkapp.com/messages/outbound?count=${PAGE_SIZE}&offset=${offset}`, {
    headers: { Accept: 'application/json', 'X-Postmark-Server-Token': token },
  });
  if (!res.ok) {
    throw new Error(`Postmark API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as PostmarkOutboundResponse;
}

async function main() {
  const token = process.env.EMAIL_API_KEY;
  if (!token) {
    console.error('EMAIL_API_KEY is not set — nothing to authenticate the Postmark API call with.');
    process.exit(1);
  }
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outPath = outArg ? outArg.slice('--out='.length) : 'postmark-export.csv';

  const rows: string[] = ['message_id,recipients,received_at,subject,status,tag'];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const page = await fetchPage(token, offset);
    total = page.TotalCount;
    for (const m of page.Messages) {
      rows.push([
        csvField(m.MessageID),
        csvField((m.Recipients ?? [m.To]).join(';')),
        csvField(m.ReceivedAt),
        csvField(m.Subject),
        csvField(m.Status),
        csvField(m.Tag ?? ''),
      ].join(','));
    }
    offset += page.Messages.length;
    if (page.Messages.length === 0) break; // defensive — avoid an infinite loop on an API quirk
  }

  writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${rows.length - 1} message record(s) to ${outPath} (TotalCount reported by Postmark: ${total}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
