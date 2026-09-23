import { useEffect, useState } from 'react';
import {
  changeFamilyEmail, fetchFamily, resendWelcome, revokeAllSessions, setEntitlement,
  type ApiResult, type FamilyDetail, type Me,
} from './api';
import { ReasonButton } from './ReasonButton';
import type { View } from './nav';

function ResultBanner({ result }: { result: ApiResult<unknown> | null }) {
  if (!result) return null;
  return result.ok
    ? <p className="admin-message admin-message--ok">実行しました。</p>
    : <p className="admin-message admin-message--error">失敗しました: {result.message}</p>;
}

/** AD-16 §8: the family surface — profile/progress SUMMARIES only (unit counts, first-paid-use
 *  timestamp), never raw progress content or anything else a child actually did — matching
 *  exactly what the backend's own `GET /admin-api/families/{id}` returns, nothing this component
 *  adds on top. */
export function FamilyView({ familyId, me, onNavigate }: { familyId: string; me: Me; onNavigate: (view: View) => void }) {
  const [detail, setDetail] = useState<FamilyDetail | null | 'loading' | 'error'>('loading');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [lastResult, setLastResult] = useState<ApiResult<unknown> | null>(null);
  const canWrite = me.role === 'operator';

  async function reload() {
    const result = await fetchFamily(familyId);
    setDetail(result.ok ? result.data : 'error');
  }

  useEffect(() => {
    setDetail('loading');
    setLastResult(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  if (detail === 'loading') return <section className="admin-section"><p>読み込み中…</p></section>;
  if (detail === 'error' || detail === null) return <section className="admin-section"><p className="admin-message admin-message--error">この家族を取得できませんでした。</p></section>;

  return (
    <section className="admin-section">
      <h2>家族: {detail.familyId}</h2>
      <ResultBanner result={lastResult} />
      <dl className="admin-kv">
        <dt>メールアドレス</dt><dd>{detail.email}{me.role === 'viewer' && <span className="admin-badge">閲覧のみ（マスク済み）</span>}</dd>
        <dt>状態</dt><dd>{detail.status}</dd>
        <dt>作成日</dt><dd>{detail.createdAt}</dd>
      </dl>

      <h3>プロフィール</h3>
      <table className="admin-table">
        <thead><tr><th>ニックネーム</th><th>完了ユニット数</th><th>初回有料利用</th></tr></thead>
        <tbody>
          {detail.profiles.map((p) => (
            <tr key={p.id}>
              <td>{p.nicknameId}</td>
              <td>{p.progressSummary.map((s) => `${s.moduleId}: ${s.unitsCompleted}`).join(', ') || '—'}</td>
              <td>{p.firstPaidUseAt ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>お試し期間</h3>
      <table className="admin-table">
        <thead><tr><th>モジュール</th><th>開始</th><th>終了</th><th>購入済み</th></tr></thead>
        <tbody>
          {detail.trials.map((t) => (
            <tr key={t.moduleId}>
              <td>{t.moduleId}</td><td>{t.startedAt}</td><td>{t.endsAt}</td><td>{t.convertedAt ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>権利（エンタイトルメント）</h3>
      <table className="admin-table">
        <thead><tr><th>モジュール</th><th>状態</th><th>注文</th><th /></tr></thead>
        <tbody>
          {detail.entitlements.map((e) => (
            <tr key={e.moduleId}>
              <td>{e.moduleId}</td>
              <td>
                <span className={`admin-badge ${e.status === 'active' ? 'admin-badge--ok' : 'admin-badge--danger'}`}>{e.status}</span>
              </td>
              <td>{e.shopifyOrderId}</td>
              <td>
                {canWrite && (
                  <ReasonButton
                    label={e.status === 'active' ? '無効化' : '有効化'}
                    onRun={(reason) => setEntitlement(detail.familyId, e.moduleId, e.status === 'active' ? 'revoked' : 'active', reason)}
                    onResult={(r) => { setLastResult(r); if (r.ok) void reload(); }}
                  />
                )}
              </td>
            </tr>
          ))}
          {detail.entitlements.length === 0 && <tr><td colSpan={4}>権利はまだありません。</td></tr>}
        </tbody>
      </table>

      <h3>注文</h3>
      <table className="admin-table">
        <tbody>
          {detail.orders.map((o) => (
            <tr key={o.shopifyOrderId} className="is-clickable" onClick={() => onNavigate({ kind: 'order', orderId: o.shopifyOrderId })}>
              <td>{o.orderName}</td><td>{o.bindingState}</td><td>{o.entitlementState}</td>
            </tr>
          ))}
          {detail.orders.length === 0 && <tr><td>この家族に紐づく注文はありません。</td></tr>}
        </tbody>
      </table>

      <h3>端末（セッション）</h3>
      <table className="admin-table">
        <tbody>
          {detail.sessions.map((s) => <tr key={s.id}><td>{s.label}</td><td>{s.lastSeenAt}</td></tr>)}
          {detail.sessions.length === 0 && <tr><td>アクティブな端末はありません。</td></tr>}
        </tbody>
      </table>

      {canWrite && (
        <div className="admin-actions">
          <ReasonButton
            label="ウェルカムメールを再送"
            onRun={async (reason) => { void reason; return resendWelcome(detail.familyId); }}
            onResult={setLastResult}
          />
        </div>
      )}

      {canWrite && (
        <div className="admin-section" style={{ marginTop: '1rem' }}>
          <h3>メールアドレスの変更</h3>
          <div className="admin-form">
            <input className="admin-input" value={newEmailInput} onChange={(e) => setNewEmailInput(e.target.value)} placeholder="new@example.com" />
          </div>
          <ReasonButton
            label="メールアドレスを変更"
            disabled={!newEmailInput.trim()}
            onRun={(reason) => changeFamilyEmail(detail.familyId, newEmailInput.trim(), reason)}
            onResult={(r) => { setLastResult(r); if (r.ok) { setNewEmailInput(''); void reload(); } }}
          />
        </div>
      )}

      {canWrite && (
        <div className="admin-section" style={{ marginTop: '1rem' }}>
          <h3>すべての端末をサインアウト</h3>
          <ReasonButton
            label="全端末サインアウト"
            onRun={(reason) => revokeAllSessions(detail.familyId, reason)}
            onResult={(r) => { setLastResult(r); if (r.ok) void reload(); }}
          />
        </div>
      )}
    </section>
  );
}
