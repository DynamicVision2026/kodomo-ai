import { CONSENT_TEXT_VERSION } from '../../../shared/consent';
import {
  CONSENT_BUTTON_LABEL, CONSENT_CONFIRM_NOTE, CONSENT_CONTACT_EMAIL, CONSENT_DECLINE_NOTE, CONSENT_LEAD,
  CONSENT_LINKS, CONSENT_NO_MARKETING_NOTE, CONSENT_RECORD_NOTE,
} from '../../legal/consentText';
import { useEffect, useState, type FormEvent } from 'react';
import { load, save } from '../../engine/storage';
import { fetchMe, requestLoginCode, verifyLoginCode, type MeResponse } from '../../family/api';
import { hydrateFromServer, importGuestProfiles } from '../../family/session';
import { track } from '../../engine/analytics';
import { COMPANY } from '../../legal/company';
import moduleJson from '../../modules/m1/module.json';
import './login.css';

type Step =
  | { kind: 'checking' }
  | { kind: 'email' }
  | { kind: 'email-loading' }
  | { kind: 'code'; email: string }
  | { kind: 'code-loading'; email: string }
  | { kind: 'code-error'; email: string; reason: string }
  | { kind: 'signed-in' }
  | { kind: 'not-configured' };

// AD-16 §0: login is never gated by trial state any more — `verifyLoginCode`'s own outcome type
// is now exactly 'ok' | 'invalid' | 'expired' | 'locked' (backend/src/loginCode.ts), so a
// 'trial_expired' code-verify failure can no longer actually happen; the old AD-15-era branch
// for it is retired along with the bug it used to work around.
const CODE_ERROR_MESSAGE: Record<string, string> = {
  invalid: 'コードが正しくありません。もう一度ご確認ください。',
  expired: 'コードの有効期限が切れました。もう一度お送りします。',
  locked: '試行回数の上限に達しました。もう一度コードをお送りします。',
  network: `通信エラーが発生しました。しばらくしてから、もう一度お試しください。`,
  server: `エラーが発生しました。しばらくしてから、もう一度お試しください。解決しない場合は、${COMPANY.email} までご連絡ください。`,
};

/** Same visibility rule `BeginnerCourseApp.tsx`/`src/family/api.ts`'s own `MeResponse.courseAllowed`
 *  doc comment already establish: the build-time general-availability flag, or this family's own
 *  allowlist/preview-email grant (`me.courseAllowed`, computed server-side by
 *  `isCourseAllowedForFamily`). Kept local rather than imported — the one-line expression isn't
 *  worth a shared helper across two otherwise-unrelated files. */
function courseVisible(me: MeResponse): boolean {
  return import.meta.env.VITE_BEGINNER_LAUNCH === '1' || me.courseAllowed;
}

/** AD-16 §2: the claim flow (and any other future flow) sends a parent here with
 *  `?next=/some/path` so a successful login returns them to where they came from instead of the
 *  default below. Only ever a same-origin absolute path — never an open redirect to an arbitrary
 *  external URL, whatever `next` claims.
 *
 *  Post-launch-check fix (Founder report, domo-ai.com): with no explicit `?next=`, a plain login
 *  used to always land on `/play/` — never `/account/` (that only ever happens via an explicit
 *  `?next=/account/`, e.g. the purchase CTA's own `/login/?next=/account/`, which is unaffected
 *  by this change). The actual gap: `/play/` was the only default, even for a family the beginner
 *  course is already visible to, who'd then have to navigate there themselves. Now: the course
 *  garden if it's visible to this family, `/play/` otherwise. */
function resolveNextPath(me: MeResponse): string {
  const next = new URLSearchParams(window.location.search).get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return courseVisible(me) ? '/course/beginner/' : '/play/';
}

/**
 * /login — AD-13 §5 step 3: email -> 6-digit code -> session cookie -> guest import -> profile
 * picker. Parent-only (src/parent, exempt from gate:no-input/gate:no-hardcoded-copy the same way
 * the old /play/unlock screen was — never something a child operates).
 */
export function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: 'checking' });
  // Email-redesign (Founder, 1 Oct 2026), item 6: the activation email's button links here with
  // `?email=` set to the recipient's own address (backend/src/links.ts's `activationLoginUrl`) so
  // a not-yet-logged-in parent lands with the field already filled — never auto-submitted, since
  // "no magic link" (item 6) means a code is still required every time.
  const [emailInput, setEmailInput] = useState(() => new URLSearchParams(window.location.search).get('email') ?? '');
  const [codeInput, setCodeInput] = useState('');

  // Post-launch-check fix: a parent whose session cookie is still valid must never see the login
  // form at all — /play/ already sends them straight to the profile picker on a fresh session, so
  // landing here instead (e.g. a stale bookmark, or the trial/purchase CTA's own `/login/?next=…`
  // redirect) should bounce straight to `next` without a form flash in between.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetchMe();
      if (cancelled) return;
      // `?reconsent=1`: a signed-in family with no recorded consent (e.g. created before consent
      // existed) is sent here to agree; it must see the form instead of being bounced onward.
      const needsConsent = new URLSearchParams(window.location.search).get('reconsent') === '1' && !me?.consentRecorded;
      if (me && !needsConsent) {
        window.location.href = resolveNextPath(me);
        return;
      }
      setStep({ kind: 'email' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;
    setStep({ kind: 'email-loading' });
    const result = await requestLoginCode(email, CONSENT_TEXT_VERSION);
    if ('reason' in result && result.reason === 'not_configured') {
      setStep({ kind: 'not-configured' });
      return;
    }
    track('login_code_requested', {});
    setStep({ kind: 'code', email });
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!('email' in step)) return;
    const email = step.email;
    const code = codeInput.trim();
    if (!code) return;
    setStep({ kind: 'code-loading', email });

    const result = await verifyLoginCode(email, code);
    if (!('me' in result)) {
      setStep({ kind: 'code-error', email, reason: result.reason });
      return;
    }

    track('login_succeeded', {});
    let appState = load();
    appState = await importGuestProfiles(appState, moduleJson.id);
    appState = await hydrateFromServer(appState, result.me, moduleJson.id);
    save(appState);
    setStep({ kind: 'signed-in' });
    window.location.href = resolveNextPath(result.me);
  }

  return (
    <main className="login">
      <h1>ログイン</h1>

      {step.kind === 'checking' && <p className="login__message">確認しています…</p>}

      {step.kind === 'email' || step.kind === 'email-loading' ? (
        <>
          <p className="login__lead">
            メールアドレスを入力してください。ログイン用のコードをお送りします。はじめての方も、このまま登録できます。
          </p>
          <div className="login__consent" data-consent-version={CONSENT_TEXT_VERSION}>
            <p className="login__consent-text">{CONSENT_LEAD}</p>
            <p className="login__consent-text">{CONSENT_CONFIRM_NOTE}</p>
            <ul className="login__consent-links">
              {CONSENT_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <form className="login__form" onSubmit={submitEmail}>
            <label className="login__label" htmlFor="email">メールアドレス</label>
            <input
              id="email"
              type="email"
              className="login__input"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              disabled={step.kind === 'email-loading'}
              autoComplete="email"
            />
            <button type="submit" className="login__submit" disabled={step.kind === 'email-loading' || !emailInput.trim()}>
              {step.kind === 'email-loading' ? '送信中…' : CONSENT_BUTTON_LABEL}
            </button>
          </form>
          <p className="login__consent-note">{CONSENT_RECORD_NOTE}</p>
          <p className="login__consent-note">{CONSENT_NO_MARKETING_NOTE}</p>
          <p className="login__consent-note">
            {CONSENT_DECLINE_NOTE}
            <a href={`mailto:${CONSENT_CONTACT_EMAIL}`}>{CONSENT_CONTACT_EMAIL}</a>
          </p>
        </>
      ) : null}

      {step.kind === 'not-configured' && (
        <p className="login__message login__message--error">この機能はまだ準備中です。しばらくしてから、もう一度お試しください。</p>
      )}

      {(step.kind === 'code' || step.kind === 'code-loading' || step.kind === 'code-error') && (
        <>
          <p className="login__lead">{step.email} にお送りしたコードを入力してください。</p>
          <form className="login__form" onSubmit={submitCode}>
            <label className="login__label" htmlFor="code">ログインコード</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              className="login__input"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="123456"
              disabled={step.kind === 'code-loading'}
              autoComplete="one-time-code"
            />
            <button type="submit" className="login__submit" disabled={step.kind === 'code-loading' || !codeInput.trim()}>
              {step.kind === 'code-loading' ? '確認中…' : 'ログイン'}
            </button>
          </form>
          {step.kind === 'code-error' && (
            <p className="login__message login__message--error">{CODE_ERROR_MESSAGE[step.reason] ?? CODE_ERROR_MESSAGE.server}</p>
          )}
        </>
      )}

      {step.kind === 'signed-in' && <p className="login__message login__message--success">ログインしました。移動しています…</p>}
    </main>
  );
}
