import type { Archetype, DigTag, SlotAssemblyPhase, SlotId } from './types';

/**
 * Slot-assembly resolver. Matches on TAGS, never on card ids, and returns the first rule that fits.
 * Spec v0.5 §7. This is what keeps pre-generated content countable.
 */
export function resolveArchetype(
  phase: SlotAssemblyPhase,
  chosen: Record<SlotId, string | undefined>,
): { key: string; archetype: Archetype } {
  const tagOf = (slot: SlotId): string => {
    const cardId = chosen[slot];
    if (!cardId) return 'missing';
    const card = phase.cards.find((c) => c.id === cardId);
    return card ? card.tag : 'missing';
  };

  for (const rule of phase.rules) {
    const ok = Object.entries(rule.when).every(([slot, want]) => {
      const actual = tagOf(slot);
      return want === '*' ? actual !== 'missing' : actual === want;
    });
    if (ok) {
      const a = phase.archetypes[rule.archetype];
      if (!a) throw new Error(`Rule points at unknown archetype: ${rule.archetype}`);
      return { key: rule.archetype, archetype: a };
    }
  }
  throw new Error('No rule matched. Every mission needs a catch-all rule.');
}

/** Dig cards: only `deepen` advances a layer. */
export function advances(tag: DigTag): tag is 'deepen' {
  return tag === 'deepen';
}
