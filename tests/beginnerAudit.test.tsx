/**
 * WO-C5 §3/§11 — unit coverage for the チェック (audit) screen's own rules: 3 cards, tapping `ok`
 * advances; anything else shows feedback + retries, removing that card, so with exactly one `ok`
 * a second miss always narrows down to the one remaining (correct) card, and there's never a
 * score or red cross shown.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditScreen } from '../src/course/screens/AuditScreen';
import { __resetCourseAudioPlayerForTests } from '../src/course/courseAudioPlayer';
import type { CourseAuditItem } from '../src/course/content/types';

// jsdom's HTMLMediaElement.play() has no real media pipeline and returns undefined rather than a
// Promise — courseAudioPlayer.ts's own `.play().catch(...)` (real production code, not a
// test-only path) throws on that. Same stubbing technique tests/ListeningPocket.test.tsx's own
// header comment documents for the same jsdom gap.
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => { /* jsdom has no real media pipeline */ };
});

// courseAudioPlayer.ts is a module-scoped singleton (by design — one <audio> element for the
// whole real page session) — reset it between tests so one test's queue state can't bleed into
// the next within this file.
beforeEach(() => __resetCourseAudioPlayerForTests());
afterEach(() => cleanup());

const ITEM: CourseAuditItem = {
  id: 'k1',
  scene: 'scene',
  q0: ['ポン太', 'いつ公園に行く？'],
  answer: ['お母さん', '後でね。'],
  prompt: 'どのカードをひらく？',
  cards: [
    ['other', '「後で」って何時ごろ？', 'いい質問！でもちがうよ。'],
    ['ok', 'なんで、後でなの？', 'やったね！'],
    ['none', 'どこに行くの？', 'それは答えの中にないよ。'],
  ],
};

describe('AuditScreen — 3-card narrowing, no score/red cross', () => {
  it('tapping the `ok` card first try advances immediately', async () => {
    const user = userEvent.setup();
    const doneIds: string[] = [];
    render(
      <AuditScreen
        lessonId="b01"
        item={ITEM}
        position={{ index: 0, total: 1 }}
        onItemDone={(id) => doneIds.push(id)}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );
    await user.click(screen.getByText('なんで、後でなの？'));
    expect(doneIds).toEqual(['k1']);
    expect(screen.getByText('やったね！')).toBeTruthy();
    expect(screen.getByText(/^できた！$/)).toBeTruthy(); // courseUi.auditOkLabel
    // No score or red cross anywhere on this screen.
    expect(screen.queryByText(/✕|×|点/)).toBeNull();
  });

  it('two misses in a row always narrow down to exactly the one remaining `ok` card', async () => {
    const user = userEvent.setup();
    const doneIds: string[] = [];
    render(
      <AuditScreen
        lessonId="b01"
        item={ITEM}
        position={{ index: 0, total: 1 }}
        onItemDone={(id) => doneIds.push(id)}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );

    // First miss: pick a wrong card, see its own feedback, retry.
    await user.click(screen.getByText('「後で」って何時ごろ？'));
    expect(doneIds).toEqual([]);
    await user.click(screen.getByText('もう一回えらぶ'));

    // That card is gone now — two cards left.
    expect(screen.queryByText('「後で」って何時ごろ？')).toBeNull();
    expect(screen.getByText('どこに行くの？')).toBeTruthy();
    expect(screen.getByText('なんで、後でなの？')).toBeTruthy();

    // Second miss: pick the other wrong card.
    await user.click(screen.getByText('どこに行くの？'));
    await user.click(screen.getByText('もう一回えらぶ'));

    // Only the `ok` card remains now.
    expect(screen.queryByText('どこに行くの？')).toBeNull();
    expect(screen.getByText('なんで、後でなの？')).toBeTruthy();

    await user.click(screen.getByText('なんで、後でなの？'));
    expect(doneIds).toEqual(['k1']);
  });
});
