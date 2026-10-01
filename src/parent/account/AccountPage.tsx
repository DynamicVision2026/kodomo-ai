import { useEffect, useRef, useState } from 'react';
import {
  confirmEmailChange,
  deleteAccount,
  deleteSession,
  fetchMe,
  listSessions,
  logout,
  requestDeleteCode,
  requestEmailChange,
  type MeResponse,
  type SessionInfo,
} from '../../family/api';
import { usePurchaseFlow } from '../../family/usePurchaseFlow';
import { COMPANY } from '../../legal/company';
import { NoticeD } from '../../legal/NoticeD';
import moduleJson from '../../modules/m1/module.json';
import './account.css';

type EmailChangeStep = { kind: 'idle' } | { kind: 'awaiting-code'; newEmail: string } | { kind: 'error'; message: string };
type DeleteStep = { kind: 'idle' } | { kind: 'code-sent' } | { kind: 'confirming' } | { kind: 'error'; message: string };

/** AD-16 §1: the one module this storefront sells today — same source module.json already
 *  supplies the play surface's own moduleId/title, never a second hand-typed copy of either. */
const PURCHASE_MODULE_ID = moduleJson.id;
const PURCHASE_MODULE_TITLE = moduleJson.title;

// COPY-01 naming table, same "モジュール1 is retired as a public name once BEGINNER_LAUNCH is on"
// rule TokushohoPage.tsx already applies to 商品名 — same underlying m1 entitlement either way,
// only the public label changes.
const BEGINNER_LAUNCH = import.meta.env.VITE_BEGINNER_LAUNCH === '1';
const PURCHASED_MODULE_LABEL = BEGINNER_LAUNCH ? '入門コース' : 'Module 1';

/** usePurchaseFlow (src/family, not exempt from gate:no-hardcoded-copy) stays copy-free — this
 *  mirrors src/lp/LandingPage.tsx's own identical map for the same reason. */
const PURCHASE_ERROR_MESSAGE: Record<'not_configured' | 'other', string> = {
  not_configured: 'ただいま購入手続きの準備中です。しばらくしてから、もう一度お試しください。',
  other: '購入手続きを開始できませんでした。しばらくしてから、もう一度お試しください。',
};

/** Post-launch-check (Founder, iPhone test): 「購入日：◯月◯日」 — the parent's own local calendar
 *  date (never UTC), month/day only, no year (a household licence never expires). */
function formatPurchaseDate(grantedAtIso: string): string {
  const d = new Date(grantedAtIso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

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
  const { state: purchaseState, startPurchase } = usePurchaseFlow(PURCHASE_MODULE_ID);

  useEffect(() => {
    fetchMe().then(setMe);
    listSessions().then(setSessions);
  }, []);

  // The landing page's buy button sends a parent through /login/ and back here with `?buy=1`:
  // once signed in WITH recorded consent and not already entitled (a waiting order may just have
  // been bound at login), go straight on to the Shopify checkout with the purchase token — one
  // time only, and the flag is stripped from the URL so a refresh never re-opens checkout.
  const autoBuyHandled = useRef(false);
  useEffect(() => {
    if (autoBuyHandled.current || me === 'loading' || !me) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('buy') !== '1') return;
    autoBuyHandled.current = true;
    params.delete('buy');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
    const alreadyEntitled = me.entitlements.some((e) => e.moduleId === PURCHASE_MODULE_ID && e.status === 'active');
    if (!alreadyEntitled && me.consentRecorded) void startPurchase();
  }, [me, startPurchase]);

  // AD-14 decision 7: once the entitlement lands (usePurchaseFlow's own /me polling), refresh
  // this page's own `me` so the purchase section itself updates (alreadyEntitled below) rather
  // than staying stale under the thank-you message forever.
  useEffect(() => {
    if (purchaseState.kind === 'paid') fetchMe().then(setMe);
  }, [purchaseState.kind]);

  async function handleSignOutDevice(id: string) {
    await deleteSession(id);
    setSessions(await listSessions());
  }

  async function handleLogout() {
    await logout();
    window.location.href = '/login/';
  }

  /** A family from before consent existed can't be emailed at all (backend/src/emailGate.ts), so
   *  an email-change or deletion code would silently never arrive — send it to agree first. */
  function sendToConsentIfMissing(): boolean {
    if (me === 'loading' || !me || me.consentRecorded) return false;
    window.location.href = '/login/?reconsent=1&next=' + encodeURIComponent('/account/');
    return true;
  }

  async function submitNewEmail() {
    if (sendToConsentIfMissing()) return;
    const newEmail = newEmailInput.trim();
    if (!newEmail) return;
    const result = await requestEmailChange(newEmail);
    if ('reason' in result) {
      // Post-launch-check (Founder, iPhone test): a same-address "change" used to send a code
      // and, on confirm, two identical "your login email changed" notifications to that one
      // address — refused here, before any code is ever sent.
      const message = result.reason === 'same_email'
        ? '現在のメールアドレスと同じです'
        : '送信できませんでした。しばらくしてから、もう一度お試しください。';
      setEmailStep({ kind: 'error', message });
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
    if (sendToConsentIfMissing()) return;
    const result = await requestDeleteCode();
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

  const purchasedModule = me.entitlements.find((e) => e.moduleId === PURCHASE_MODULE_ID);
  const alreadyEntitled = purchasedModule?.status === 'active';

  return (
    <main className="account">
      <h1>アカウント</h1>
      <p className="account__lead">ログイン中のメールアドレス：{me.email}</p>

      <section className="account__section">
        <h2>購入</h2>
        {alreadyEntitled && purchasedModule &&
          (purchaseState.kind === 'idle' || purchaseState.kind === 'loading' || purchaseState.kind === 'error') && (
            <p className="account__purchase-status">
              ご購入済み：ナゼホリ {PURCHASED_MODULE_LABEL}（購入日：{formatPurchaseDate(purchasedModule.grantedAt)}）
            </p>
          )}
        {!alreadyEntitled &&
          (purchaseState.kind === 'idle' || purchaseState.kind === 'loading' || purchaseState.kind === 'error') && (
            <>
              <p>「{PURCHASE_MODULE_TITLE}」を購入すると、すべてのミッションが使えるようになります。</p>
              <NoticeD className="account__notice-d" />
              <button
                type="button"
                className="account__button"
                onClick={startPurchase}
                disabled={purchaseState.kind === 'loading'}
              >
                購入手続きへ進む
              </button>
              {purchaseState.kind === 'error' && (
                <p className="account__message account__message--error">{PURCHASE_ERROR_MESSAGE[purchaseState.reason]}</p>
              )}
            </>
          )}
        {/* AD-14 decision 7: checkout opened in a new tab (usePurchaseFlow's own startPurchase)
            — this tab waits here, polling /me for the entitlement Shopify's orders/paid webhook
            grants server-side, then hands the parent straight into the app. */}
        {purchaseState.kind === 'awaiting-payment' && (
          <p className="account__message">
            お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。
          </p>
        )}
        {purchaseState.kind === 'paid' && (
          <div className="account__message account__message--success">
            <p>ご購入ありがとうございます！</p>
            <a className="account__button" href="/play/">つづきから あそぶ</a>
          </div>
        )}
      </section>

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
