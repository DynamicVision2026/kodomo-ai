export type View =
  | { kind: 'search' }
  | { kind: 'family'; familyId: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'queues' }
  | { kind: 'audit' };

/** Query-param-driven, not a router library — this whole app is one page with five in-place
 *  views, same "no client-side router" convention the rest of this repo already follows
 *  (Dockerfile.frontend's own doc comment). Still gives every view a real, shareable,
 *  back-button-safe URL (`?view=family&id=...`), which a plain in-memory `useState` wouldn't. */
export function viewFromUrl(): View {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('view');
  const id = params.get('id') ?? '';
  if (kind === 'family' && id) return { kind: 'family', familyId: id };
  if (kind === 'order' && id) return { kind: 'order', orderId: id };
  if (kind === 'queues') return { kind: 'queues' };
  if (kind === 'audit') return { kind: 'audit' };
  return { kind: 'search' };
}

export function urlForView(view: View): string {
  const params = new URLSearchParams();
  if (view.kind !== 'search') params.set('view', view.kind);
  if (view.kind === 'family') params.set('id', view.familyId);
  if (view.kind === 'order') params.set('id', view.orderId);
  const qs = params.toString();
  return qs ? `?${qs}` : '/';
}

export function pushView(view: View): void {
  window.history.pushState({}, '', urlForView(view));
}
