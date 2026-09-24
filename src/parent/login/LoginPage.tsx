import { useState, type FormEvent } from 'react';
import { load, save } from '../../engine/storage';
import { requestLoginCode, verifyLoginCode } from '../../family/api';
import { hydrateFromServer, importGuestProfiles } from '../../family/session';
import { track } from '../../engine/analytics';
import { COMPANY } from '../../legal/company';
import moduleJson from '../../modules/m1/module.json';
import './login.css';

type Step =
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

/** AD-16 §2: the claim flow (and any other future flow) sends a parent here with
 *  `?next=/some/path` so a successful login returns them to where they came from instead of
 *  always landing on `/play/`. Only ever a same-origin absolute path — never an open redirect to
 *  an arbitrary external URL, whatever `next` claims. */
function resolveNextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/play/';
}

/**
 * /login — AD-13 §5 step 3: email -> 6-digit code -> session cookie -> guest import -> profile
 * picker. Parent-only (src/parent, exempt from gate:no-input/gate:no-hardcoded-copy the same way
 * the old /play/unlock screen was — never something a child operates).
 */
export function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;
    setStep({ kind: 'email-loading' });
    const result = await requestLoginCode(email);
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
    window.location.href = resolveNextPath();
  }

  return (
    <main className="login">
      <h1>ログイン</h1>

      {step.kind === 'email' || step.kind === 'email-loading' ? (
        <>
          <p className="login__lead">
            メールアドレスを入力してください。ログイン用のコードをお送りします。はじめての方も、このまま登録できます。
          </p>
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
              {step.kind === 'email-loading' ? '送信中…' : 'コードを送る'}
            </button>
          </form>
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
