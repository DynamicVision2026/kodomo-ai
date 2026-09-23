import { useEffect, useState } from 'react';
import { fetchQueue, type QueueName } from './api';
import type { View } from './nav';
import type { OrderDoc } from '../../backend/src/schema';

const QUEUES: { name: QueueName; label: string }[] = [
  { name: 'awaiting_claim', label: '受け取り待ち' },
  { name: 'needs_review', label: '要確認' },
  { name: 'duplicate', label: '重複購入' },
  { name: 'refund_requests', label: '返金申請' },
];

/** AD-16 §8: the four operator queues — every one a single equality-filtered query
 *  (backend/src/adminRouter.ts's own `handleQueue`), never a full scan the UI has to filter
 *  itself. Read-only; every staff role can view. */
export function QueuesView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [active, setActive] = useState<QueueName>('awaiting_claim');
  const [orders, setOrders] = useState<OrderDoc[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    setOrders('loading');
    fetchQueue(active).then((result) => setOrders(result.ok ? result.data : 'error'));
  }, [active]);

  return (
    <section className="admin-section">
      <h2>キュー</h2>
      <div className="admin-nav">
        {QUEUES.map((q) => (
          <button key={q.name} type="button" className={active === q.name ? 'is-active' : ''} onClick={() => setActive(q.name)}>
            {q.label}
          </button>
        ))}
      </div>

      {orders === 'loading' && <p>読み込み中…</p>}
      {orders === 'error' && <p className="admin-message admin-message--error">取得できませんでした。</p>}
      {Array.isArray(orders) && (
        orders.length === 0 ? <p>該当する注文はありません。</p> : (
          <table className="admin-table">
            <thead><tr><th>注文番号</th><th>紐付け状態</th><th>権利状態</th><th>返金状態</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.shopifyOrderId} className="is-clickable" onClick={() => onNavigate({ kind: 'order', orderId: o.shopifyOrderId })}>
                  <td>{o.orderName}</td><td>{o.bindingState}</td><td>{o.entitlementState}</td><td>{o.refund.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  );
}
