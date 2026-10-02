import { useEffect, useState } from 'react';
import {
  bindOrder, decideRefund, fetchOrder, requestRefund, resendClaim, type AdminOrderDetail, type ApiResult, type Me,
} from './api';
import { ReasonButton } from './ReasonButton';
import type { View } from './nav';

function ResultBanner({ result }: { result: ApiResult<unknown> | null }) {
  if (!result) return null;
  return result.ok
    ? <p className="admin-message admin-message--ok">実行しました。</p>
    : <p className="admin-message admin-message--error">失敗しました: {result.message}</p>;
}

/**
 * AD-16 §8: order + refund detail. Refund approval/decline is recorded here, but the actual
 * Shopify refund is never issued from this dashboard — AD-16 §7 is explicit that stays a manual
 * step in Shopify admin, so the decision panel says so rather than implying a button here
 * finishes the refund.
 */
export function OrderView({ orderId, me, onNavigate }: { orderId: string; me: Me; onNavigate: (view: View) => void }) {
  const [order, setOrder] = useState<AdminOrderDetail | null | 'loading' | 'error'>('loading');
  const [bindFamilyId, setBindFamilyId] = useState('');
  const [refundChannel, setRefundChannel] = useState('');
  const [lastResult, setLastResult] = useState<ApiResult<unknown> | null>(null);
  const canWrite = me.role === 'operator';

  async function reload() {
    const result = await fetchOrder(orderId);
    setOrder(result.ok ? result.data : 'error');
  }

  useEffect(() => {
    setOrder('loading');
    setLastResult(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (order === 'loading') return <section className="admin-section"><p>読み込み中…</p></section>;
  if (order === 'error' || order === null) return <section className="admin-section"><p className="admin-message admin-message--error">この注文を取得できませんでした。</p></section>;

  return (
    <section className="admin-section">
      <h2>注文: {order.orderName}</h2>
      <ResultBanner result={lastResult} />
      <dl className="admin-kv">
        <dt>Shopify注文ID</dt><dd>{order.shopifyOrderId}</dd>
        <dt>購入者メール</dt><dd>{order.purchaserEmail ?? '—'}</dd>
        <dt>家族</dt>
        <dd>
          {order.familyId
            ? <button type="button" className="admin-btn" onClick={() => onNavigate({ kind: 'family', familyId: order.familyId! })}>{order.familyId}</button>
            : '未紐付け'}
        </dd>
        <dt>紐付け方法</dt><dd>{order.bindingMethod ?? '—'}</dd>
        <dt>紐付け状態</dt><dd><span className="admin-badge">{order.bindingState}</span></dd>
        <dt>権利状態</dt><dd><span className="admin-badge">{order.entitlementState}</span></dd>
        <dt>支払い状況</dt><dd>{order.financialStatus}</dd>
        <dt>支払日</dt><dd>{order.paidAt}</dd>
        <dt>金額</dt><dd>¥{order.amountTotal.toLocaleString()}</dd>
        <dt>支払い後のログイン</dt>
        <dd>{order.loggedInSincePayment ? `はい（${order.firstLoginSincePaymentAt}）` : 'いいえ'}</dd>
      </dl>

      <h3>商品明細</h3>
      <table className="admin-table">
        <thead><tr><th>SKU</th><th>モジュール</th><th>数量</th><th>金額</th></tr></thead>
        <tbody>
          {order.lines.map((l, i) => (
            <tr key={i}><td>{l.sku}</td><td>{l.moduleId}</td><td>{l.quantity}</td><td>¥{l.lineTotal.toLocaleString()}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>返金</h3>
      <dl className="admin-kv">
        <dt>状態</dt><dd><span className="admin-badge">{order.refund.state}</span></dd>
        <dt>申請日</dt><dd>{order.refund.requestedAt ?? '—'}</dd>
        <dt>判定</dt><dd>{order.refund.decision ?? '未判定'}</dd>
        <dt>Shopify管理画面</dt>
        <dd>
          {order.shopifyAdminUrl
            ? <a className="admin-btn" href={order.shopifyAdminUrl} target="_blank" rel="noopener noreferrer">Shopifyで注文を開く</a>
            : '—'}
        </dd>
      </dl>
      {order.refund.eligibilitySnapshot && (
        <dl className="admin-kv">
          <dt>購入からの経過日数</dt><dd>{order.refund.eligibilitySnapshot.purchaseAgeDays}日</dd>
          <dt>期間内</dt><dd>{order.refund.eligibilitySnapshot.withinWindow ? 'はい' : 'いいえ'}</dd>
          <dt>有料コンテンツ利用済み</dt><dd>{order.refund.eligibilitySnapshot.paidContentUsed ? 'はい' : 'いいえ'}</dd>
          <dt>形式上の返金対象</dt><dd>{order.refund.eligibilitySnapshot.objectivelyEligible ? 'はい（最終判断は担当者が行います）' : 'いいえ'}</dd>
        </dl>
      )}

      {canWrite && (
        <div className="admin-actions">
          {!order.familyId && (
            <>
              {/* Item 9 (Founder, 1 Oct 2026):手動紐づけは、購入メールアドレスの持ち主を確認しないまま
                  アクセス権を他人のアカウントへ渡しかねない操作なので、押す前に必ず読む運用上の注意。 */}
              <p className="admin-notice">
                購入時のメールアドレス宛てに、info@ から本人確認のメールを送り、返信を確認してから紐づけてください。
              </p>
              <input className="admin-input" style={{ maxWidth: '14rem' }} value={bindFamilyId} onChange={(e) => setBindFamilyId(e.target.value)} placeholder="家族ID" />
              <ReasonButton
                label="この家族に紐付ける"
                disabled={!bindFamilyId.trim()}
                onRun={(reason) => bindOrder(order.shopifyOrderId, bindFamilyId.trim(), reason)}
                onResult={(r) => { setLastResult(r); if (r.ok) { setBindFamilyId(''); void reload(); } }}
              />
            </>
          )}
          {order.purchaserEmail && order.bindingState === 'awaiting_claim' && (
            <ReasonButton
              label="受け取りメールを再送"
              onRun={(reason) => resendClaim(order.shopifyOrderId, reason)}
              onResult={setLastResult}
            />
          )}
          {order.refund.state === 'none' && (
            <>
              <input className="admin-input" style={{ maxWidth: '10rem' }} value={refundChannel} onChange={(e) => setRefundChannel(e.target.value)} placeholder="申請経路（例: メール）" />
              <ReasonButton
                label="返金申請を記録"
                onRun={(reason) => requestRefund(order.shopifyOrderId, refundChannel.trim(), reason)}
                onResult={(r) => { setLastResult(r); if (r.ok) void reload(); }}
              />
            </>
          )}
          {order.refund.state === 'requested' && (
            <>
              <ReasonButton
                label="返金を承認"
                onRun={(reason) => decideRefund(order.shopifyOrderId, 'approved', reason)}
                onResult={(r) => { setLastResult(r); if (r.ok) void reload(); }}
              />
              <ReasonButton
                label="返金を却下"
                onRun={(reason) => decideRefund(order.shopifyOrderId, 'declined', reason)}
                onResult={(r) => { setLastResult(r); if (r.ok) void reload(); }}
              />
            </>
          )}
          {order.refund.decision === 'approved' && order.refund.state !== 'refunded' && (
            <p className="admin-message">
              承認済みです。実際の返金はShopify管理画面から行ってください（このダッシュボードは実行しません）。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
