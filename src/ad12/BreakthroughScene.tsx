import { useLayoutEffect, useRef } from 'react';
import { Ruby } from '../engine/ruby';
import { FieldStage, type FieldTone } from './FieldStage';
import { DepthRow } from './DepthRow';
import { Plane } from './Plane';
import { captureRect, animate, tokenMs } from './motion';
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
   *  adds motion around it, it does not change what a resting layer plane looks like. */
  planeText: string;
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
export function BreakthroughScene({ tone, total, current, rootReached, planeText }: BreakthroughSceneProps) {
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

      const dx = to.left - from.left;
      const dy = to.top - from.top;
      const sx = from.width ? to.width / from.width : 1;
      const sy = fromHeight ? to.height / fromHeight : 1;

      const hide = () => {
        chip.style.opacity = '0';
      };
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
    prevCurrentRef.current = current;
  }, [current]);

  return (
    <div ref={containerRef} className="ad12-breakthrough-scene">
      <FieldStage tone={tone}>
        <div ref={planeRef}>
          <Plane className="ad12-breakthrough-scene__plane">
            <p className="ad12-reading-text"><Ruby text={planeText} /></p>
          </Plane>
        </div>
      </FieldStage>
      <DepthRow total={total} current={current} rootReached={rootReached} />
      <div ref={chipRef} className="ad12-breakthrough-scene__chip" aria-hidden="true" />
    </div>
  );
}
