import { useState } from 'react';
import { fetchAuditLog } from './api';
import type { AuditLogDoc } from '../../backend/src/schema';

type FilterMode = 'target' | 'actor';

/** AD-16 §8: append-only audit log, filterable by a target (family id or order id) or by the
 *  staff member who acted — matches the backend's `GET /admin-api/audit?targetId=...` and
 *  `?actor=...` exactly. Read-only for every staff role; there is no edit or delete control
 *  anywhere in this view because there is no such endpoint to call. */
export function AuditView() {
  const [mode, setMode] = useState<FilterMode>('target');
  const [value, setValue] = useState('');
  const [entries, setEntries] = useState<AuditLogDoc[] | null | 'loading' | 'error'>(null);

  async function submit() {
    if (!value.trim()) return;
    setEntries('loading');
    const result = mode === 'target' ? await fetchAuditLog({ targetId: value.trim() }) : await fetchAuditLog({ actor: value.trim() });
    setEntries(result.ok ? result.data : 'error');
  }

  return (
    <section className="admin-section">
      <h2>監査ログ</h2>
      <p>家族ID・注文ID、またはスタッフのメールアドレスを入力して、対応する操作記録を表示します。</p>
      <form className="admin-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <select className="admin-input" value={mode} onChange={(e) => setMode(e.target.value as FilterMode)}>
          <option value="target">家族ID / 注文ID</option>
          <option value="actor">実行者（スタッフ）メール</option>
        </select>
        <input
          className="admin-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={mode === 'target' ? '家族ID または 注文ID' : 'staff@example.com'}
        />
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
