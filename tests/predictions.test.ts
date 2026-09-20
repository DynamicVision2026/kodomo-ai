import { describe, it, expect } from 'vitest';
import { resolveSlotAssemblyPredictionOptions, resolveDigLayerPredictionOptions } from '../src/engine/predictions';
import type { DigPhase, SlotAssemblyPhase } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';

const slotPhase = mission.phases[0] as unknown as SlotAssemblyPhase;
const digPhase = mission.phases[1] as unknown as DigPhase;

describe('resolveSlotAssemblyPredictionOptions', () => {
  it('resolves each archetype key to the card that actually produces it, including the wildcard VAGUE rule', () => {
    const prompt = slotPhase.predictions![0]!;
    const options = resolveSlotAssemblyPredictionOptions(slotPhase, prompt);
    expect(options).toEqual([
      { key: 'CLEAR', label: 'パンが ふくらむのは なぜ？' },
      { key: 'VAGUE', label: 'パンのこと おしえて' },
      { key: 'OFFTOPIC', label: 'おいしい パンって なに' },
    ]);
  });

  it('throws a clear error for an archetype no card can produce', () => {
    expect(() =>
      resolveSlotAssemblyPredictionOptions(slotPhase, { beforeRound: 1, options: ['NOPE'] }),
    ).toThrow(/no card resolves to archetype "NOPE"/);
  });
});

describe('resolveDigLayerPredictionOptions', () => {
  it('resolves each card id to its hand card text', () => {
    const layer1 = digPhase.layers[1]!;
    const prompt = layer1.prediction!;
    const options = resolveDigLayerPredictionOptions(layer1, prompt);
    expect(options).toEqual([
      { key: 'f4', label: 'ガスが 出ると、どうして ふくらむの？' },
      { key: 'f5', label: 'さとうは あまいの？' },
      { key: 'f6', label: 'もう いちど いって' },
    ]);
  });

  it('throws a clear error for a card id not in this layer\'s hand', () => {
    const layer0 = digPhase.layers[0]!;
    expect(() =>
      resolveDigLayerPredictionOptions(layer0, { beforeRound: 1, options: ['not-a-real-id'] }),
    ).toThrow(/no hand card with id "not-a-real-id"/);
  });
});
