import { useState } from 'react';
import { search, type SearchResults } from './api';
import type { View } from './nav';

/** AD-16 §8: "one box — account email, purchaser email, order number, Shopify order ID, or
 *  family ID." Read-only; every staff role can search. */
export function SearchView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!q.trim()) return;
    setError(null);
    const result = await search(q.trim());
    if (!result.ok) {
      setError(result.message);
      setResults(null);
      return;
    }
    setResults(result.data);
  }

  return (
    <section className="admin-section">
      <h2>検索</h2>
      <p>アカウントのメールアドレス、購入者のメールアドレス、注文番号、Shopify注文ID、または家族IDで検索できます。</p>
      <form className="admin-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input className="admin-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="parent@example.com / #1234 / f-xxxx" />
        <button type="submit" className="admin-btn admin-btn--primary">検索</button>
      </form>

      {error && <p className="admin-message admin-message--error">{error}</p>}

      {results && (
        <>
          <h3>家族（{results.families.length}件）</h3>
          {results.families.length === 0 ? <p>一致する家族はありません。</p> : (
            <table className="admin-table">
              <tbody>
                {results.families.map((f) => (
                  <tr key={f.familyId} className="is-clickable" onClick={() => onNavigate({ kind: 'family', familyId: f.familyId })}>
                    <td>{f.familyId}</td>
                    <td>{f.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>注文（{results.orders.length}件）</h3>
          {results.orders.length === 0 ? <p>一致する注文はありません。</p> : (
            <table className="admin-table">
              <tbody>
                {results.orders.map((o) => (
                  <tr key={o.shopifyOrderId} className="is-clickable" onClick={() => onNavigate({ kind: 'order', orderId: o.shopifyOrderId })}>
                    <td>{o.orderName}</td>
                    <td>{o.shopifyOrderId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
