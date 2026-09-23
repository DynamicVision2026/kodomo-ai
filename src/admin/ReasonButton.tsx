import { useState } from 'react';
import type { ApiResult } from './api';

/**
 * AD-16 §8: "reason required for every staff write." The one shared control every operator
 * mutation in this dashboard goes through — a plain button never fires the action directly; it
 * opens an inline reason field first, and the action only runs once that field is non-empty and
 * the operator explicitly confirms. `disabled` covers both "you're a viewer" (never even shown
 * the prompt) and "an action is already in flight."
 */
export function ReasonButton({
  label, disabled, onRun, onResult,
}: {
  label: string;
  disabled?: boolean;
  onRun: (reason: string) => Promise<ApiResult<unknown>>;
  onResult: (result: ApiResult<unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="admin-btn" disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="admin-reason">
      <label className="admin-reason__label">
        理由（必須）
        <input
          className="admin-reason__input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例: 保護者からの問い合わせ #1234"
          autoFocus
        />
      </label>
      <div className="admin-reason__actions">
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={!reason.trim() || busy}
          onClick={async () => {
            setBusy(true);
            const result = await onRun(reason.trim());
            setBusy(false);
            onResult(result);
            if (result.ok) {
              setOpen(false);
              setReason('');
            }
          }}
        >
          {busy ? '実行中…' : `${label}を実行`}
        </button>
        <button type="button" className="admin-btn" disabled={busy} onClick={() => { setOpen(false); setReason(''); }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
