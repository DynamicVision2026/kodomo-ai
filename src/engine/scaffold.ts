/**
 * WO-04: deterministic scaffold progression. Tracks, per follow-up move, how much demonstrated
 * use has accumulated, and derives a monotonic rung from it — no scoring, no semantic judgment,
 * no inference from Gap Naming. Execution Handoff v2 / WO-04, R08.
 *
 * Rung identifiers are romanized (mihakken/moratta/tsukaeru/hitoride/sotode), the same way move
 * ids are romanized rather than their Japanese display label (follow-naze, not the label shown
 * on a なぜ？ card) — gate:no-hardcoded-copy reserves the Japanese labels for module JSON, for
 * whichever later UI ticket actually displays a rung.
 *
 * Rung order: mihakken (みはっけん, seen) -> moratta (もらった, given) -> tsukaeru (つかえる,
 * usable) -> hitoride (ひとりで, alone) -> sotode (そとで, outside). This ticket implements only
 * the first two transitions. `hitoride` depends on a later ticket's `blind_commit`; `sotode`
 * depends on a later ticket's parent `outside_use`. Neither event is invented here —
 * `applyMoveRendered`/`applyAptUse` and the monotonic `advanceTo` helper below are the seam a
 * later ticket extends with `applyBlindCommit`/`applyOutsideUse` in the same shape, without
 * redesigning this module.
 */
export type ScaffoldRung = 'mihakken' | 'moratta' | 'tsukaeru' | 'hitoride' | 'sotode';

const RUNG_ORDER: ScaffoldRung[] = ['mihakken', 'moratta', 'tsukaeru', 'hitoride', 'sotode'];

export interface MoveProgress {
  rung: ScaffoldRung;
  /** Distinct domains that have each produced at least one qualifying `apt_use` for this move
   *  so far. Monotonic — entries are only ever added, never removed or recounted. */
  aptUseDomains: string[];
}

export type MoveProgressMap = Record<string, MoveProgress>;

/** WO-07: Blind-first's own three accepted self-report choices, romanized like every other
 *  internal identifier — the Japanese button copy (おなじだった/もっといいのを きいた/ちがった)
 *  lives only in module JSON. Display/reflection evidence only; never affects progression. */
export type SelfReportKind = 'same' | 'better' | 'different';

/** Exported so callers (WO-07's Dig, MissionShell) can decide Blind-first eligibility
 *  (tsukaeru or above) from a move's current rung without duplicating the rung ordering. */
export function isAtLeast(rung: ScaffoldRung, target: ScaffoldRung): boolean {
  return RUNG_ORDER.indexOf(rung) >= RUNG_ORDER.indexOf(target);
}

/** Progression is monotonic (WO-04): returns `target` only if `current` hasn't reached it
 *  already, so no evidence or later behaviour can ever move a rung backwards. */
function advanceTo(current: ScaffoldRung, target: ScaffoldRung): ScaffoldRung {
  return isAtLeast(current, target) ? current : target;
}

function progressOf(map: MoveProgressMap, move: string): MoveProgress {
  return map[move] ?? { rung: 'mihakken', aptUseDomains: [] };
}

/**
 * A move's follow-up card was shown to the learner, regardless of whether they play it.
 * mihakken -> moratta, once. A no-op once the move has already reached moratta or beyond.
 */
export function applyMoveRendered(map: MoveProgressMap, move: string): MoveProgressMap {
  const current = progressOf(map, move);
  const rung = advanceTo(current.rung, 'moratta');
  if (rung === current.rung) return map;
  return { ...map, [move]: { ...current, rung } };
}

/**
 * A qualifying `apt_use` of `move` in `domain`. moratta -> tsukaeru only once qualifying use
 * has been recorded in 3 DISTINCT domains — three uses in one domain never satisfies this
 * (Critical distinction, WO-04): repeating an already-counted domain adds no new count.
 */
export function applyAptUse(map: MoveProgressMap, move: string, domain: string): MoveProgressMap {
  const current = progressOf(map, move);
  const aptUseDomains = current.aptUseDomains.includes(domain)
    ? current.aptUseDomains
    : [...current.aptUseDomains, domain];
  let rung = advanceTo(current.rung, 'moratta'); // an apt_use implies the move has at least been seen
  if (aptUseDomains.length >= 3) rung = advanceTo(rung, 'tsukaeru');
  if (rung === current.rung && aptUseDomains === current.aptUseDomains) return map;
  return { ...map, [move]: { rung, aptUseDomains } };
}

/**
 * WO-07: a valid `blind_commit` for `move` — the child committed to their own next question
 * before the authored hand was shown. Advances tsukaeru -> hitoride, monotonically, and ONLY
 * when the move is already at tsukaeru or beyond: eligibility is decided by the caller (WO-07's
 * Dig checks this same rung before ever offering Blind-first), but this guard means a
 * `blind_commit` can never vault a move from below tsukaeru straight to hitoride even if it
 * somehow fired out of order — no semantic evaluation of what the child said, ever.
 */
export function applyBlindCommit(map: MoveProgressMap, move: string): MoveProgressMap {
  const current = progressOf(map, move);
  if (!isAtLeast(current.rung, 'tsukaeru')) return map;
  const rung = advanceTo(current.rung, 'hitoride');
  if (rung === current.rung) return map;
  return { ...map, [move]: { ...current, rung } };
}

/**
 * Whether a played follow-up card qualifies as `apt_use` (WO-04): only the FIRST card played at
 * a layer, and only when it carries `tag === 'deepen'`. Pure and context-free by design — a
 * second deepen play at the same layer, or any sideways/repeat/offtopic play, is provably
 * excluded without needing a live Dig session to demonstrate it.
 *
 * `playIndexAtLayer` is the zero-based count of cards already played at this layer before this
 * one (0 for the very first play at the layer).
 */
export function isAptUse(playIndexAtLayer: number, tag: string): boolean {
  return playIndexAtLayer === 0 && tag === 'deepen';
}
