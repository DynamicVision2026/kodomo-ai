import { useState } from 'react';
import { fetchAuditLog } from './api';
import type { AuditLogDoc } from '../../backend/src/schema';

/** AD-16 §8: append-only audit log, looked up by target (a family id or an order id) — matches
 *  the backend's own `GET /admin-api/audit?targetId=...` exactly (no "list everything" endpoint
 *  exists, by design: nothing here decides to add one). Read-only for every staff role; there is
 *  no edit or delete control anywhere in this view because there is no such endpoint to call. */
export function AuditView() {
  const [targetId, setTargetId] = useState('');
  const [entries, setEntries] = useState<AuditLogDoc[] | null | 'loading' | 'error'>(null);

  async function submit() {
    if (!targetId.trim()) return;
    setEntries('loading');
    const result = await fetchAuditLog(targetId.trim());
    setEntries(result.ok ? result.data : 'error');
  }

  return (
    <section className="admin-section">
      <h2>監査ログ</h2>
      <p>家族IDまたは注文IDを入力して、その対象に対するすべての操作記録を表示します。</p>
      <form className="admin-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input className="admin-input" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="家族ID または 注文ID" />
        <button type="submit" className="admin-btn admin-btn--primary">表示</button>
      </form>

      {entries === 'loading' && <p>読み込み中…</p>}
      {entries === 'error' && <p className="admin-message admin-message--error">取得できませんでした。</p>}
      {Array.isArray(entries) && (
        entries.length === 0 ? <p>この対象の記録はありません。</p> : (
          <table className="admin-table">
            <thead><tr><th>日時</th><th>実行者</th><th>操作</th><th>理由</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}><td>{e.at}</td><td>{e.actor}</td><td>{e.action}</td><td>{e.reason ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  );
}
