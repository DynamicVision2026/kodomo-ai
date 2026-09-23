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

const CODE_ERROR_MESSAGE: Record<string, string> = {
  invalid: 'コードが正しくありません。もう一度ご確認ください。',
  expired: 'コードの有効期限が切れました。もう一度お送りします。',
  locked: '試行回数の上限に達しました。もう一度コードをお送りします。',
  // AD-15: an unpurchased Family Account whose 72-hour trial has ended — the account and its
  // progress are still there, purchasing is what re-opens login (AD-15: "trial progress
  // continues after purchase").
  trial_expired: 'お試し期間が終了しました。ご購入いただくと、これまでの進み具合そのままでお使いいただけます。',
  network: `通信エラーが発生しました。しばらくしてから、もう一度お試しください。`,
  server: `エラーが発生しました。しばらくしてから、もう一度お試しください。解決しない場合は、${COMPANY.email} までご連絡ください。`,
};

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
    window.location.href = '/play/';
  }

  return (
    <main className="login">
      <h1>ログイン</h1>

      {step.kind === 'email' || step.kind === 'email-loading' ? (
        <>
          <p className="login__lead">ご購入時のメールアドレスを入力してください。ログイン用のコードをお送りします。</p>
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
            <>
              <p className="login__message login__message--error">{CODE_ERROR_MESSAGE[step.reason] ?? CODE_ERROR_MESSAGE.server}</p>
              {step.reason === 'trial_expired' && <a className="login__cta" href="/">ご購入はこちら</a>}
            </>
          )}
        </>
      )}

      {step.kind === 'signed-in' && <p className="login__message login__message--success">ログインしました。移動しています…</p>}
    </main>
  );
}
