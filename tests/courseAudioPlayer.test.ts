/**
 * Founder iPad Safari fix (28 Sep 2026): "audio plays the first line, then stops; the progress
 * bar doesn't move." Root cause and fix are both in src/course/courseAudioPlayer.ts's own doc
 * comment — this is the direct unit coverage for the fix itself: exactly ONE `<audio>`-backed
 * element is ever created, `unlock()` is idempotent, and `playQueue()` chains multiple clips
 * through that same element rather than creating a new one per clip.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unlock, playQueue, stopQueue, __resetCourseAudioPlayerForTests } from '../src/course/courseAudioPlayer';

let audioInstances: HTMLAudioElement[] = [];

beforeEach(() => {
  __resetCourseAudioPlayerForTests();
  audioInstances = [];
  window.HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLAudioElement) {
    audioInstances.push(this);
    return Promise.resolve();
  });
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

describe('courseAudioPlayer — exactly one <audio> element, ever', () => {
  it('unlock() creates one Audio instance; playQueue() reuses that SAME instance, never a new one', () => {
    unlock();
    expect(new Set(audioInstances).size).toBe(1);
    const theOneElement = audioInstances[0];

    playQueue(['audio/course/b01/b01_e01_q0.mp3', 'audio/course/b01/b01_e01_reply.mp3']);
    expect(audioInstances.every((el) => el === theOneElement)).toBe(true);
  });

  it('unlock() is idempotent — calling it again after real playback has started never creates a second element or interrupts it', () => {
    unlock();
    playQueue(['audio/course/b01/b01_e01_q0.mp3']);
    const theOneElement = audioInstances[audioInstances.length - 1] as HTMLAudioElement;
    const srcBeforeSecondUnlock = theOneElement.src;

    unlock();
    expect(new Set(audioInstances).size).toBe(1);
    expect(theOneElement.src).toBe(srcBeforeSecondUnlock);
  });

  it('playQueue() plays multiple clips in order, one at a time, through the ended event — never all at once', () => {
    const playCalls = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    playQueue(['a.mp3', 'b.mp3', 'c.mp3']);

    expect(playCalls).toHaveBeenCalledTimes(1);
    const el = audioInstances[0]!;
    expect(el.src).toContain('/a.mp3');

    el.dispatchEvent(new Event('ended'));
    expect(playCalls).toHaveBeenCalledTimes(2);
    expect(el.src).toContain('/b.mp3');

    el.dispatchEvent(new Event('ended'));
    expect(playCalls).toHaveBeenCalledTimes(3);
    expect(el.src).toContain('/c.mp3');

    el.dispatchEvent(new Event('ended'));
    expect(playCalls).toHaveBeenCalledTimes(3); // queue exhausted — no 4th play
  });

  it('skips falsy entries (a conditional clip that does not apply) without playing an empty src', () => {
    playQueue([undefined, 'real.mp3', undefined]);
    expect(audioInstances[0]!.src).toContain('/real.mp3');
  });

  it('a clip that errors (404 — not recorded yet) advances to the next one instead of getting stuck', () => {
    playQueue(['missing.mp3', 'present.mp3']);
    const el = audioInstances[0]!;
    expect(el.src).toContain('/missing.mp3');
    el.dispatchEvent(new Event('error'));
    expect(el.src).toContain('/present.mp3');
  });

  it('a new playQueue() call interrupts whatever was still mid-queue (never plays stale clips over new ones)', () => {
    playQueue(['old-a.mp3', 'old-b.mp3']);
    const el = audioInstances[0]!;
    expect(el.src).toContain('/old-a.mp3');

    playQueue(['new-a.mp3']);
    expect(el.src).toContain('/new-a.mp3');

    el.dispatchEvent(new Event('ended'));
    expect(el.src).not.toContain('old-b.mp3'); // the old queue's remaining clip never plays
  });

  it('stopQueue() pauses and clears the queue so nothing keeps playing into the next screen', () => {
    const pauseCalls = window.HTMLMediaElement.prototype.pause as ReturnType<typeof vi.fn>;
    playQueue(['a.mp3', 'b.mp3']);
    const el = audioInstances[0]!;

    stopQueue();
    expect(pauseCalls).toHaveBeenCalled();

    el.dispatchEvent(new Event('ended'));
    expect(el.src).toContain('/a.mp3'); // unchanged — the queue was cleared, "ended" has nothing left to advance to
  });
});
