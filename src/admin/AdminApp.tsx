import { useEffect, useState } from 'react';
import { fetchMe, type Me } from './api';
import { pushView, viewFromUrl, type View } from './nav';
import { SearchView } from './SearchView';
import { FamilyView } from './FamilyView';
import { OrderView } from './OrderView';
import { QueuesView } from './QueuesView';
import { AuditView } from './AuditView';
import './admin.css';

const NAV_ITEMS: { kind: View['kind']; label: string }[] = [
  { kind: 'search', label: '検索' },
  { kind: 'queues', label: 'キュー' },
  { kind: 'audit', label: '監査ログ' },
];

/**
 * The `kodomo-ai-admin` dashboard's own shell (AD-16 §8). IAP sits in front of the whole service
 * this bundle is served from — a request never reaches here at all without a verified Google
 * identity — so this component's only job is `GET /admin-api/me` (is that identity actually on
 * the `staff/` allowlist, and with which role) before rendering anything real.
 */
export function AdminApp() {
  const [me, setMe] = useState<Me | null | 'loading' | 'error'>('loading');
  const [view, setView] = useState<View>(viewFromUrl());

  useEffect(() => {
    fetchMe().then((result) => setMe(result.ok ? result.data : 'error'));
  }, []);

  useEffect(() => {
    const onPopState = () => setView(viewFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(next: View) {
    pushView(next);
    setView(next);
  }

  if (me === 'loading') return <main className="admin"><p>読み込み中…</p></main>;
  if (me === 'error' || me === null) {
    return (
      <main className="admin">
        <p className="admin-message admin-message--error">
          アクセス権を確認できませんでした。このアカウントがstaff一覧に登録されているか確認してください。
        </p>
      </main>
    );
  }

  return (
    <main className="admin">
      <header className="admin-header">
        <h1>kodomo-ai admin</h1>
        <p className="admin-header__identity">
          {me.email}
          <span className="admin-header__role">{me.role === 'operator' ? '操作者' : '閲覧のみ'}</span>
        </p>
      </header>

      <nav className="admin-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.kind}
            type="button"
            className={view.kind === item.kind ? 'is-active' : ''}
            onClick={() => navigate(item.kind === 'search' ? { kind: 'search' } : item.kind === 'queues' ? { kind: 'queues' } : { kind: 'audit' })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view.kind === 'search' && <SearchView onNavigate={navigate} />}
      {view.kind === 'family' && <FamilyView familyId={view.familyId} me={me} onNavigate={navigate} />}
      {view.kind === 'order' && <OrderView orderId={view.orderId} me={me} onNavigate={navigate} />}
      {view.kind === 'queues' && <QueuesView onNavigate={navigate} />}
      {view.kind === 'audit' && <AuditView />}
    </main>
  );
}
