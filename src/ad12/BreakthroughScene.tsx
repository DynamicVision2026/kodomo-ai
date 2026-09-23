import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Ruby } from '../engine/ruby';
import { FieldStage, type FieldTone } from './FieldStage';
import { DepthRow } from './DepthRow';
import { Plane } from './Plane';
import { captureRect, animate, tokenMs, prefersReducedMotion } from './motion';
import './primitives.css';
import './breakthrough-scene.css';

export interface BreakthroughSceneProps {
  /** The dig's own current field tone — read straight off `DigState`/atRoot, same contract as a
   *  bare `FieldStage` (this component makes no correctness/progression decision of its own). */
  tone: FieldTone;
  total: number;
  current: number;
  rootReached: boolean;
  /** The layer's own answer text — this is still just an ordinary reading plane; Breakthrough
   *  adds motion around it, it does not change what a resting layer plane looks like. Ignored
   *  when `children` is supplied (see below). Required otherwise — the Pass 1/2 gallery's own
   *  demo usage keeps working exactly as before. */
  planeText?: string;
  /** Builder work order §4: a live caller (MissionStage) renders whatever it would already show
   *  at this exact moment (its own reading plane, prediction battle, root reveal, etc.) here
   *  instead of BreakthroughScene's own fixed Plane+planeText — the FLIP still fires off
   *  whatever rect that content settles into, exactly the same mechanism, just pointed at real,
   *  varying live content instead of one fixed demo string. Omitted: unchanged fallback below. */
  children?: ReactNode;
  /** Forwarded verbatim to the internal DepthRow — see DepthRow's own `otherYellowActive` doc
   *  comment (mutes the root tab's accent while RootPlane's own hairline is also on screen). */
  otherYellowActive?: boolean;
}

/**
 * AD-12 §3 Breakthrough: "the field steps one tone deeper" (FieldStage's own background
 * transition, unchanged) plus this library's one true FLIP use case — when `current` goes up
 * (a real breakthrough, driven entirely by the caller's own engine state, never by this
 * component), the just-answered layer plane visually travels into the depth row's newly-filled
 * tab: First (the plane's rect) / Last (the tab's rect) / Invert (the delta) / Play (WAAPI),
 * using `captureRect`/`animate` from motion.ts. A synthetic chip plays the travel — the real
 * plane and the real tab never move or resize themselves, so neither one's own layout/tests are
 * affected by whether the travel animation is running.
 */
export function BreakthroughScene({
  tone, total, current, rootReached, planeText, children, otherYellowActive,
}: BreakthroughSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const prevCurrentRef = useRef(current);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const plane = planeRef.current;
    const chip = chipRef.current;
    const tab = container?.querySelector<HTMLElement>(`[data-tab-index="${current}"]`);
    if (current > prevCurrentRef.current && container && plane && chip && tab) {
      const containerRect = captureRect(container);
      const from = captureRect(plane);
      const to = captureRect(tab);
      const fromHeight = Math.min(from.height, 32);

      chip.style.left = `${from.left - containerRect.left}px`;
      chip.style.top = `${from.top - containerRect.top}px`;
      chip.style.width = `${from.width}px`;
      chip.style.height = `${fromHeight}px`;
      chip.style.opacity = '1';

      const hide = () => {
        chip.style.opacity = '0';
      };

      // Builder work order §5: under reduced motion, a FLIP shared element (this chip) never
      // travels — it becomes a short fade AT THE SOURCE, then a short fade AT THE TARGET, so
      // both ends are still visible rather than one continuous, position-changing motion.
      if (prefersReducedMotion()) {
        const reducedMs = tokenMs('--ad12-t-reduced', 180, chip);
        chip.style.transform = 'translate(0, 0) scale(1, 1)';
        const fadeAtSource = animate(chip, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
          duration: reducedMs, reducedDuration: reducedMs,
        });
        const showAtTarget = () => {
          chip.style.left = `${to.left - containerRect.left}px`;
          chip.style.top = `${to.top - containerRect.top}px`;
          chip.style.width = `${to.width}px`;
          chip.style.height = `${to.height}px`;
          const fadeAtTarget = animate(chip, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
            duration: reducedMs, reducedDuration: reducedMs,
          });
          if (fadeAtTarget) fadeAtTarget.finished.then(hide).catch(hide);
          else hide();
        };
        if (fadeAtSource) fadeAtSource.finished.then(showAtTarget).catch(showAtTarget);
        else showAtTarget();
      } else {
        const dx = to.left - from.left;
        const dy = to.top - from.top;
        const sx = from.width ? to.width / from.width : 1;
        const sy = fromHeight ? to.height / fromHeight : 1;
        // Step (1): the answered layer's plane rect files itself into the depth row's newly-
        // filled tab — a synthetic chip plays the travel; the real plane/tab never move.
        const anim = animate(
          chip,
          [
            { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 },
          ],
          { duration: tokenMs('--ad12-t-transition', 700, chip) },
        );
        if (anim) anim.finished.then(hide).catch(hide);
        else hide();
      }

      // Builder work order §4 step (4): "the new answer plane rises" — F5's own established
      // settle-spring entrance (RootPlane, SlipCascade, MoveCard's own magnify->committed all
      // share this exact opacity/translateY beat at --ad12-t-settle), played concurrently with
      // the chip travel above so the whole sequence still lands within the ≤700ms budget rather
      // than running sequentially after it. Step (3) "the field steps one tone deeper" is
      // `tone`'s own prop change, already animated by FieldStage's own background-color
      // transition — nothing extra to trigger here.
      animate(
        plane,
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: tokenMs('--ad12-t-settle', 450, plane) },
      );
    }
    prevCurrentRef.current = current;
  }, [current]);

  return (
    <div ref={containerRef} className="ad12-breakthrough-scene">
      <FieldStage tone={tone}>
        <div ref={planeRef}>
          {children ?? (
            <Plane className="ad12-breakthrough-scene__plane">
              <p className="ad12-reading-text"><Ruby text={planeText ?? ''} /></p>
            </Plane>
          )}
        </div>
      </FieldStage>
      <DepthRow total={total} current={current} rootReached={rootReached} otherYellowActive={otherYellowActive} />
      <div ref={chipRef} className="ad12-breakthrough-scene__chip" aria-hidden="true" />
    </div>
  );
}
