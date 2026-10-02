/**
 * Founder request (2 Oct 2026): "send me the post-flip emails now... as real Postmark sends, so
 * I can see them on my iPhone" — BEFORE flipping BEGINNER_LAUNCH anywhere live. Renders the exact
 * same template functions the backend sends in production (`backend/src/email.ts`), with
 * `beginnerLaunch: true` passed directly to the two gated templates, and sends them through the
 * real `PostmarkEmailSender` — never through the live `/api/v1/auth/request` endpoint (that would
 * only exercise today's still-flag-off code path; see PR #9's own "Not done" note). This script
 * touches no live flag, no Firestore record, no real order — it only proves what the templates
 * render once the flip happens.
 *
 * `loginCodeEmail` has no `beginnerLaunch` branch at all (identical either side of the flip) —
 * sent anyway since it was explicitly asked for, with a random, non-functional preview code (this
 * script creates no real session, so the code can't be used to log in regardless).
 *
 * Run (workflow_dispatch only — see .github/workflows/send-preview-emails.yml, which supplies the
 * real EMAIL_API_KEY from Secret Manager the same way postmark-export.yml already does):
 *   npx tsx scripts/send-beginner-launch-preview-emails.ts --to=someone@example.com
 */
import { loginCodeEmail, moduleActivatedEmail, claimYourPurchaseEmail } from '../backend/src/email.js';
import { PostmarkEmailSender } from '../backend/server/postmarkEmail.js';

const APP_BASE_URL = 'https://domo-ai.com';
const EMAIL_FROM = 'no-reply@domo-ai.com';
const EMAIL_FROM_NAME = 'ナゼホリ';
const EMAIL_REPLY_TO = 'info@domo-ai.com';

function randomPreviewCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function main() {
  const token = process.env.EMAIL_API_KEY;
  if (!token) {
    console.error('EMAIL_API_KEY is not set — nothing to authenticate the Postmark API call with.');
    process.exit(1);
  }
  const toArg = process.argv.find((a) => a.startsWith('--to='));
  const to = toArg ? toArg.slice('--to='.length) : null;
  if (!to) {
    console.error('Usage: npx tsx scripts/send-beginner-launch-preview-emails.ts --to=someone@example.com');
    process.exit(1);
  }

  const sender = new PostmarkEmailSender(token, EMAIL_FROM, EMAIL_FROM_NAME, EMAIL_REPLY_TO);

  // 1. Login-code email — unchanged by the flip (no beginnerLaunch branch exists), sent as asked.
  const loginCode = randomPreviewCode();
  const login = loginCodeEmail(to, loginCode, APP_BASE_URL);

  // 2. Activation email, POST-FLIP copy (beginnerLaunch: true) — the real activation login URL
  //    shape once BEGINNER_LAUNCH is on (email pre-filled, next=/course/beginner/).
  const activationLoginUrl = `${APP_BASE_URL}/login/?email=${encodeURIComponent(to)}&next=${encodeURIComponent('/course/beginner/')}`;
  const activation = moduleActivatedEmail(to, activationLoginUrl, true);

  // 3. Claim email, POST-FLIP copy (beginnerLaunch: true) — token is a non-functional preview
  //    value (this script creates no real order/claim record), labeled as such in the path itself.
  const claimUrl = `${APP_BASE_URL}/claim?token=preview-not-a-real-token`;
  const claim = claimYourPurchaseEmail(to, '#PREVIEW', claimUrl, true);

  for (const message of [login, activation, claim]) {
    console.log(`Sending "${message.subject}" to ${message.to}...`);
    await sender.send(message);
    console.log(`  sent.`);
  }
  console.log(`\nAll 3 preview emails sent to ${to} (login code shown: ${loginCode}, not a real session).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
