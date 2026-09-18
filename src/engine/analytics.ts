/**
 * Cookieless, event-only wrapper. Spec v0.5 §11.
 * No ad pixels under /play. Never send anything identifying a child.
 */
export type EventName =
  | 'lp_view' | 'grade_pick' | 'cta_play_click' | 'cta_buy_click' | 'deck_sample_download'
  | 'm1_start' | 'coop_selected' | 'prediction_made' | 'round_complete' | 'early_ok_tapped'
  | 'dig_layer_reached' | 'root_reached' | 'teachback_done' | 'teachback_skipped'
  | 'm1_complete' | 'parent_screen_view' | 'buy_click_from_app'
  // Not in spec v0.5 §11's fixed event list — added for /play/unlock (Task 7's redemption
  // screen) because "did the family code flow actually work" has no other signal. Flagging
  // for founder sign-off rather than silently expanding a spec-enumerated list.
  | 'code_redeemed';

type Props = Record<string, string | number | boolean>;

declare global {
  interface Window { plausible?: (name: string, opts?: { props: Props }) => void }
}

let variant: 'A' | 'B' = 'A';
export function setVariant(v: 'A' | 'B') { variant = v; }

export function track(name: EventName, props: Props = {}): void {
  try {
    window.plausible?.(name, { props: { ...props, abVariant: variant } });
  } catch {
    /* analytics must never break play */
  }
}
