import { useState, type FormEvent } from 'react';
import { load, save } from '../../engine/storage';
import { applyRedemption } from '../../engine/entitlements';
import { track } from '../../engine/analytics';
import { redeemFamilyCode, type RedeemFailure, type RedeemResult } from './redeemCode';
import './unlock.css';

/** Set once the backend (backend/src/ + backend/server/, deployed to Cloud Run) is actually
 *  live. Undefined in every environment until then — this repo has never had a live
 *  deployment (docs/launch-runbook.md). */
const API_BASE_URL: string | undefined = import.meta.env.VITE_UNLOCK_API_URL;

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; result: RedeemResult };

const REASON_MESSAGE: Record<RedeemFailure['reason'], string> = {
  not_configured: 'この機能はまだ準備中です。しばらくしてから、もう一度お試しください。',
  not_found: 'コードが見つかりませんでした。入力内容をご確認のうえ、もう一度お試しください。',
  network: '通信エラーが発生しました。しばらくしてから、もう一度お試しください。',
  server: 'エラーが発生しました。しばらくしてから、もう一度お試しください。',
};

/**
 * /play/unlock — parent-only redemption screen (src/parent, exempt from gate:no-free-text and
 * gate:no-hardcoded-copy the same way src/lp/src/legal are: this is never something a child
 * operates). Spec v0.5 §7: family code -> backend + persistent store -> module entitlement.
 */
export function UnlockPage() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setStatus({ kind: 'loading' });

    const state = load();
    const result = await redeemFamilyCode(API_BASE_URL, code, state.deviceId);
    setStatus({ kind: 'done', result });
    track('code_redeemed', { success: result.ok });

    if (result.ok) {
      save(applyRedemption(state, result));
    }
  }

  return (
    <main className="unlock">
      <h1>家族用コードの登録</h1>
      <p className="unlock__lead">
        ご購入時にお送りしたメールに記載の家族用コード（NAZE-XXXX-XXXX の形式）を入力してください。
        このお手続きは、この端末で一度だけ必要です。
      </p>

      <form className="unlock__form" onSubmit={submit}>
        <label className="unlock__label" htmlFor="family-code">
          家族用コード
        </label>
        <input
          id="family-code"
          type="text"
          className="unlock__input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="NAZE-XXXX-XXXX"
          disabled={status.kind === 'loading'}
          autoComplete="off"
        />
        <button type="submit" className="unlock__submit" disabled={status.kind === 'loading' || !code.trim()}>
          {status.kind === 'loading' ? '確認中…' : '登録する'}
        </button>
      </form>

      {status.kind === 'done' && status.result.ok && (
        <p className="unlock__message unlock__message--success">
          登録が完了しました。このまま「ミッションを始める」からお楽しみいただけます。
          {status.result.overCap && (
            <span className="unlock__overcap-note">
              {' '}
              （このコードは複数の端末で使われています。ご家庭以外での共有にお気づきの場合は、
              サポートまでご連絡ください。）
            </span>
          )}
        </p>
      )}
      {status.kind === 'done' && !status.result.ok && (
        <p className="unlock__message unlock__message--error">{REASON_MESSAGE[status.result.reason]}</p>
      )}

      {status.kind === 'done' && status.result.ok && (
        <a className="unlock__cta" href="/play/">
          ミッションを始める
        </a>
      )}
    </main>
  );
}
