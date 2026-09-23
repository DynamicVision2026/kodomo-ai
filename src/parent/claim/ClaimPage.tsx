import { useEffect, useState } from 'react';
import { confirmClaim, getClaim, type ClaimInfo } from '../../family/api';
import { COMPANY } from '../../legal/company';
import moduleJson from '../../modules/m1/module.json';
import './claim.css';

type Step =
  | { kind: 'loading' }
  | { kind: 'no-token' }
  | { kind: 'needs-login' }
  | { kind: 'not-found' }
  | { kind: 'ready'; claim: ClaimInfo }
  | { kind: 'confirming'; claim: ClaimInfo }
  | { kind: 'error'; message: string }
  | { kind: 'done'; orderName: string };

const MODULE_TITLES: Record<string, string> = { [moduleJson.id]: moduleJson.title };

function moduleTitle(moduleId: string): string {
  return MODULE_TITLES[moduleId] ?? moduleId;
}

function tokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

function loginHref(token: string): string {
  const next = `/claim/?token=${encodeURIComponent(token)}`;
  return `/login/?next=${encodeURIComponent(next)}`;
}

/**
 * /claim — AD-16 §2: reached from the "claim your purchase" email sent when an order couldn't be
 * bound by purchase-intent token or an existing account's email. Parent-only (src/parent, outside
 * /play — never part of the child play surface, same reasoning as /login and /account),
 * exempt from gate:no-input/gate:no-hardcoded-copy for the same reason those two are.
 *
 * Flow: claim link -> (log in if no session yet, returning here via `next`) -> show the order/
 * product this claim is for -> one explicit confirm tap -> bind. Never auto-binds on page load —
 * AD-16 §2's own "one confirm tap binds the order," not a silent redirect-and-grant.
 */
export function ClaimPage() {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const token = tokenFromUrl();

  useEffect(() => {
    if (!token) {
      setStep({ kind: 'no-token' });
      return;
    }
    let cancelled = false;
    getClaim(token).then((result) => {
      if (cancelled) return;
      if (!('claim' in result)) {
        if (result.reason === 'unauthorized') setStep({ kind: 'needs-login' });
        else if (result.reason === 'not_found') setStep({ kind: 'not-found' });
        else setStep({ kind: 'error', message: 'この情報を取得できませんでした。しばらくしてから、もう一度お試しください。' });
        return;
      }
      setStep({ kind: 'ready', claim: result.claim });
    });
    return () => { cancelled = true; };
  }, [token]);

  async function confirm() {
    if (step.kind !== 'ready' || !token) return;
    setStep({ kind: 'confirming', claim: step.claim });
    const result = await confirmClaim(token);
    if (!('orderName' in result)) {
      const message = result.reason === 'invalid_or_expired'
        ? 'このリンクはすでに使用されたか、有効期限が切れています。'
        : '受け取り手続きを完了できませんでした。しばらくしてから、もう一度お試しください。';
      setStep({ kind: 'error', message });
      return;
    }
    setStep({ kind: 'done', orderName: result.orderName });
  }

  return (
    <main className="claim">
      <h1>ご購入の受け取り</h1>

      {step.kind === 'loading' && <p className="claim__lead">読み込み中…</p>}

      {step.kind === 'no-token' && (
        <p className="claim__message claim__message--error">
          リンクが正しくないようです。お送りしたメールのリンクからもう一度お試しください。
        </p>
      )}

      {step.kind === 'needs-login' && token && (
        <>
          <p className="claim__lead">
            お子さまが使っているアカウントのメールアドレスでログインしてください。ログイン後、このページに戻ります。
          </p>
          <a className="claim__cta" href={loginHref(token)}>ログインする</a>
        </>
      )}

      {step.kind === 'not-found' && (
        <p className="claim__message claim__message--error">
          このリンクはすでに使用されたか、有効期限が切れています。お心当たりがない場合は{COMPANY.email}までご連絡ください。
        </p>
      )}

      {(step.kind === 'ready' || step.kind === 'confirming') && (
        <>
          <p className="claim__lead">以下のご注文を、いまログイン中のアカウントに登録します。</p>
          <dl className="claim__order">
            <dt>注文番号</dt>
            <dd>{step.claim.orderName}</dd>
            <dt>商品</dt>
            <dd>{step.claim.moduleIds.map(moduleTitle).join('、')}</dd>
          </dl>
          <button
            type="button"
            className="claim__confirm"
            onClick={confirm}
            disabled={step.kind === 'confirming'}
          >
            {step.kind === 'confirming' ? '登録中…' : 'このアカウントに登録する'}
          </button>
        </>
      )}

      {step.kind === 'error' && (
        <p className="claim__message claim__message--error">{step.message}</p>
      )}

      {step.kind === 'done' && (
        <>
          <p className="claim__message claim__message--success">
            ご注文{step.orderName}を登録しました。すべてのミッションが使えるようになりました。
          </p>
          <a className="claim__cta" href="/play/">はじめる</a>
        </>
      )}
    </main>
  );
}
