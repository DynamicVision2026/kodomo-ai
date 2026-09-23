import { useEffect, useState } from 'react';
import {
  confirmEmailChange,
  deleteAccount,
  deleteSession,
  fetchMe,
  listSessions,
  logout,
  requestEmailChange,
  requestLoginCode,
  type MeResponse,
  type SessionInfo,
} from '../../family/api';
import { COMPANY } from '../../legal/company';
import './account.css';

type EmailChangeStep = { kind: 'idle' } | { kind: 'awaiting-code'; newEmail: string } | { kind: 'error'; message: string };
type DeleteStep = { kind: 'idle' } | { kind: 'code-sent' } | { kind: 'confirming' } | { kind: 'error'; message: string };

/**
 * /account — AD-13 §3/§5 step 6: device list + sign-out, email change (two-step, OTP to the new
 * address), account deletion (requires a fresh code). Parent-only (src/parent).
 */
export function AccountPage() {
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailCodeInput, setEmailCodeInput] = useState('');
  const [emailStep, setEmailStep] = useState<EmailChangeStep>({ kind: 'idle' });
  const [deleteCodeInput, setDeleteCodeInput] = useState('');
  const [deleteStep, setDeleteStep] = useState<DeleteStep>({ kind: 'idle' });

  useEffect(() => {
    fetchMe().then(setMe);
    listSessions().then(setSessions);
  }, []);

  async function handleSignOutDevice(id: string) {
    await deleteSession(id);
    setSessions(await listSessions());
  }

  async function handleLogout() {
    await logout();
    window.location.href = '/login/';
  }

  async function submitNewEmail() {
    const newEmail = newEmailInput.trim();
    if (!newEmail) return;
    const result = await requestEmailChange(newEmail);
    if ('reason' in result) {
      setEmailStep({ kind: 'error', message: '送信できませんでした。しばらくしてから、もう一度お試しください。' });
      return;
    }
    setEmailStep({ kind: 'awaiting-code', newEmail });
  }

  async function confirmNewEmail() {
    if (emailStep.kind !== 'awaiting-code') return;
    const result = await confirmEmailChange(emailStep.newEmail, emailCodeInput.trim());
    if ('reason' in result) {
      setEmailStep({ kind: 'error', message: 'コードが正しくないか、有効期限が切れています。' });
      return;
    }
    setMe(await fetchMe());
    setEmailStep({ kind: 'idle' });
    setNewEmailInput('');
    setEmailCodeInput('');
  }

  async function sendDeleteCode() {
    if (me === 'loading' || !me) return;
    const result = await requestLoginCode(me.email);
    if ('reason' in result) {
      setDeleteStep({ kind: 'error', message: '送信できませんでした。しばらくしてから、もう一度お試しください。' });
      return;
    }
    setDeleteStep({ kind: 'code-sent' });
  }

  async function confirmDelete() {
    setDeleteStep({ kind: 'confirming' });
    const result = await deleteAccount(deleteCodeInput.trim());
    if ('reason' in result) {
      setDeleteStep({ kind: 'error', message: 'コードが正しくないか、有効期限が切れています。' });
      return;
    }
    window.location.href = '/';
  }

  if (me === 'loading') return <main className="account"><p>読み込み中…</p></main>;
  if (me === null) {
    return (
      <main className="account">
        <h1>アカウント</h1>
        <p className="account__lead">ログインが必要です。</p>
        <a className="account__link" href="/login/">ログインする</a>
      </main>
    );
  }

  return (
    <main className="account">
      <h1>アカウント</h1>
      <p className="account__lead">ログイン中のメールアドレス：{me.email}</p>

      <section className="account__section">
        <h2>使用中の端末</h2>
        <ul className="account__device-list">
          {sessions.map((s) => (
            <li key={s.id} className="account__device">
              <span>{s.label}{s.isCurrent ? '（この端末）' : ''}</span>
              {!s.isCurrent && (
                <button type="button" className="account__device-signout" onClick={() => handleSignOutDevice(s.id)}>
                  サインアウト
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="account__section">
        <h2>メールアドレスの変更</h2>
        {emailStep.kind !== 'awaiting-code' ? (
          <div className="account__form">
            <input
              type="email"
              className="account__input"
              value={newEmailInput}
              onChange={(e) => setNewEmailInput(e.target.value)}
              placeholder="new@example.com"
            />
            <button type="button" className="account__button" onClick={submitNewEmail} disabled={!newEmailInput.trim()}>
              コードを送る
            </button>
          </div>
        ) : (
          <div className="account__form">
            <p>{emailStep.newEmail} にお送りしたコードを入力してください。</p>
            <input
              type="text"
              inputMode="numeric"
              className="account__input"
              value={emailCodeInput}
              onChange={(e) => setEmailCodeInput(e.target.value)}
              placeholder="123456"
            />
            <button type="button" className="account__button" onClick={confirmNewEmail} disabled={!emailCodeInput.trim()}>
              変更する
            </button>
          </div>
        )}
        {emailStep.kind === 'error' && <p className="account__message account__message--error">{emailStep.message}</p>}
      </section>

      <section className="account__section">
        <h2>アカウントの削除</h2>
        {deleteStep.kind === 'idle' && (
          <button type="button" className="account__button account__button--danger" onClick={sendDeleteCode}>
            削除用のコードを送る
          </button>
        )}
        {(deleteStep.kind === 'code-sent' || deleteStep.kind === 'confirming') && (
          <div className="account__form">
            <input
              type="text"
              inputMode="numeric"
              className="account__input"
              value={deleteCodeInput}
              onChange={(e) => setDeleteCodeInput(e.target.value)}
              placeholder="123456"
            />
            <button
              type="button"
              className="account__button account__button--danger"
              onClick={confirmDelete}
              disabled={!deleteCodeInput.trim() || deleteStep.kind === 'confirming'}
            >
              完全に削除する
            </button>
          </div>
        )}
        {deleteStep.kind === 'error' && <p className="account__message account__message--error">{deleteStep.message}</p>}
        <p className="account__lead">解決しない場合は、{COMPANY.email} までご連絡ください。</p>
      </section>

      <button type="button" className="account__logout" onClick={handleLogout}>ログアウト</button>
    </main>
  );
}
