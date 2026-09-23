/**
 * Cookieless, event-only wrapper. Spec v0.5 §11.
 * No ad pixels under /play. Never send anything identifying a child.
 */
export type EventName =
  | 'lp_view' | 'grade_pick' | 'cta_play_click' | 'cta_buy_click' | 'deck_sample_download'
  | 'm1_start' | 'coop_selected' | 'prediction_made' | 'round_complete' | 'early_ok_tapped'
  | 'dig_layer_reached' | 'root_reached' | 'teachback_done' | 'teachback_skipped'
  | 'm1_complete' | 'parent_screen_view' | 'buy_click_from_app'
  // AD-13 §5: /login's own funnel signal — replaces the retired /play/unlock's `code_redeemed`
  // (the unlock-code flow itself is gone; "did email OTP login actually work" is its
  // Family-Account-era equivalent). Not in spec v0.5 §11's fixed event list.
  | 'login_code_requested' | 'login_succeeded'
  // v0.6 (WO-03, AD-01 §5): the child's Gap Naming choice, classification only — 'target',
  // 'answered' or 'other-layer' — never a correct/incorrect judgment. Also not in spec v0.5 §11.
  | 'gap_named'
  // v0.6 (WO-04): deterministic scaffold-progression evidence. `use` fires whenever a played
  // follow-up card carries a `move`; `apt_use` additionally only when it qualifies (first play
  // at the layer, tag === 'deepen') — see src/engine/scaffold.ts. Also not in spec v0.5 §11.
  | 'use' | 'apt_use'
  // v0.6 (WO-07): Blind-first evidence. `blind_commit` means only that the child committed to
  // their own question before the authored hand was shown — never a judgment of what they said.
  // `blind_selfreport` is display/reflection evidence only and never affects progression. Also
  // not in spec v0.5 §11.
  | 'blind_commit' | 'blind_selfreport'
  // WO-19: M0/M5 parent-screen evidence. `m0_sealed` fires once, on the Day-1 envelope tap.
  // `outside_use` fires whenever a parent records a real-world observation for a move — never a
  // judgment of correctness, only which move was identified. Also not in spec v0.5 §11.
  | 'm0_sealed' | 'outside_use'
  // WO-34: the optional Real AI Lab screen (after Story 1-8, before the course-complete screen,
  // co-play only) — whether the family actually took it into the real world or skipped it this
  // time. Engagement signal only, never a correctness/completion judgment — the screen has no way
  // to know what happened outside the app. Also not in spec v0.5 §11.
  | 'real_ai_lab_tried' | 'real_ai_lab_skipped';

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
