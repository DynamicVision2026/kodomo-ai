import { describe, it, expect } from 'vitest';
import { collectClaimedTexts } from '../pipeline/05_entail';
import mission from '../src/modules/m1/topics/bread/s2.json';

describe('05_entail: collectClaimedTexts', () => {
  it('collects the real bread mission\'s claim-grounded robotSays lines, skipping nonfactual ones', () => {
    const claimed = collectClaimedTexts(mission);
    // CLEAR archetype (c1), dig layer 0 (c1), dig layer 1 (c2), dig root (c3) = 4.
    // VAGUE and OFFTOPIC are ["nonfactual"] and must be excluded.
    expect(claimed).toHaveLength(4);
    expect(claimed.every((c) => !(c.claimIds.length === 1 && c.claimIds[0] === 'nonfactual'))).toBe(true);
  });

  it('pairs each entry with the right claim id(s)', () => {
    const claimed = collectClaimedTexts(mission);
    const root = claimed.find((c) => c.where === 'dig root');
    expect(root?.claimIds).toEqual(['c3']);
    const layer1 = claimed.find((c) => c.where === 'dig layer 1');
    expect(layer1?.claimIds).toEqual(['c2']);
  });

  it('skips a fully nonfactual archetype entirely', () => {
    const synthetic = {
      phases: [{
        template: 'slot-assembly',
        archetypes: { FLAVOUR: { robotSays: 'そうかもね', claims: ['nonfactual'] } },
      }],
    };
    expect(collectClaimedTexts(synthetic)).toEqual([]);
  });

  it('skips an entry with no claims array at all rather than crashing', () => {
    const synthetic = { phases: [{ template: 'dig', root: { robotSays: 'x' } }] };
    expect(collectClaimedTexts(synthetic)).toEqual([]);
  });
});
