/**
 * WO-C5 §2/§11 — unit coverage for the beginner course's own additions to ExerciseScreen:
 * `sameTool` counts as success, and b07's multi-step chains ("don't play it twice": `onItemDone`
 * only fires once, at the LAST step).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExerciseScreen } from '../src/course/screens/ExerciseScreen';
import type { CourseExercise } from '../src/course/content/types';

// See tests/beginnerAudit.test.tsx's identical stub for why this is needed (jsdom's
// HTMLMediaElement.play() gap, VoiceCue.tsx's own real `.play().catch(...)` call site).
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
});

afterEach(() => cleanup());

const CHAIN_EXERCISE: CourseExercise = {
  id: 'b07-e01',
  tool: 'G',
  scene: { text: 'scene' },
  q0: { speaker: 'ポン太', text: 'なんで、コロって名前なの？' },
  review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
  steps: [
    {
      answer: { speaker: 'おばあちゃん', text: 'まるいから、コロよ。' },
      hint: { h1: 'h1', h2Highlight: 'まるい' },
      options: [
        { id: 'a', role: 'best', kind: 'question', tool: 'G', text: 'それってどういうこと？', reply: { speaker: 'おばあちゃん', text: 'まるいってことよ。' }, feedback: 'よくきけたね！' },
        { id: 'b', role: 'nearMiss', kind: 'question', tool: null, text: 'たとえば？', reply: { speaker: 'おばあちゃん', text: 'うーん。' }, feedback: 'ちがうよ。' },
      ],
      displayOrder: ['a', 'b'],
    },
    {
      answer: { speaker: 'おばあちゃん', text: 'まるいってことよ。' },
      hint: { h1: 'h1', h2Highlight: 'まる' },
      options: [
        { id: 'a', role: 'sameTool', kind: 'question', tool: 'G', text: 'ほかには？', reply: { speaker: 'おばあちゃん', text: 'それだけよ。' }, feedback: 'つかまえた！' },
        { id: 'b', role: 'nearMiss', kind: 'stop', tool: null, text: 'ふーん、そうなんだ。', reply: { speaker: 'おばあちゃん', text: 'そうよ。' }, feedback: 'つづけよう。' },
      ],
      displayOrder: ['a', 'b'],
    },
  ],
};

describe('ExerciseScreen — b07 chains + sameTool', () => {
  it('a 2-step chain never calls onItemDone until the LAST step, and shows the step indicator', async () => {
    const user = userEvent.setup();
    const doneIds: string[] = [];
    render(
      <ExerciseScreen
        exercise={CHAIN_EXERCISE}
        position={{ index: 0, total: 1 }}
        onItemDone={(id) => doneIds.push(id)}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getByText('なんで？ 1/2')).toBeTruthy();

    // Step 1: pick the `best` option — success, but NOT the last step, so onItemDone must not fire.
    await user.click(screen.getByText('それってどういうこと？'));
    expect(doneIds).toEqual([]);

    // Advance to step 2 via the chain's own "つぎへ" button.
    await user.click(screen.getByText('つぎへ'));
    expect(screen.getByText('なんで？ 2/2')).toBeTruthy();

    // Step 2: pick the `sameTool` option — WO-C5 §2: sameTool counts as success too, and THIS is
    // the last step, so onItemDone fires exactly once now.
    await user.click(screen.getByText('ほかには？'));
    expect(doneIds).toEqual(['b07-e01']);
  });

  it('a `stop`-kind option (b07\'s nearMiss card) is treated as a miss, never advances the chain', async () => {
    const user = userEvent.setup();
    const doneIds: string[] = [];
    render(
      <ExerciseScreen
        exercise={CHAIN_EXERCISE}
        position={{ index: 0, total: 1 }}
        onItemDone={(id) => doneIds.push(id)}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );
    await user.click(screen.getByText('それってどういうこと？'));
    await user.click(screen.getByText('つぎへ'));
    // Step 2's `stop`-kind nearMiss option.
    await user.click(screen.getByText('ふーん、そうなんだ。'));
    expect(doneIds).toEqual([]);
    expect(screen.getByText('なんで？ 2/2')).toBeTruthy(); // still on step 2, not advanced
  });
});
