import type { DigLayer, PredictionPrompt, SlotAssemblyPhase } from './types';
import { resolveArchetype } from './resolver';

/** A prediction choice ready to show a player: a stable key plus its display text. */
export interface PredictionOption {
  key: string;
  /** Ruby markup allowed: {漢字|かんじ} */
  label: string;
}

/**
 * `SlotAssemblyPhase.predictions[].options` stores ARCHETYPE KEYS (e.g. "CLEAR"), not card ids
 * or display text — the prediction is "which of the visible cards leads to which outcome?".
 * A rule's `when` can be a wildcard catch-all (VAGUE matches `what: '*'`), so there is no single
 * card tag to look up directly. Instead, for each real card, ask the actual resolver what it
 * would produce and take the one that lands on the target archetype — correct by construction,
 * and it never needs to know how a particular rule is written.
 */
export function resolveSlotAssemblyPredictionOptions(
  phase: SlotAssemblyPhase,
  prompt: PredictionPrompt,
): PredictionOption[] {
  return prompt.options.map((archetypeKey) => {
    const card = phase.cards.find((c) => {
      try {
        return resolveArchetype(phase, { [c.slot]: c.id }).key === archetypeKey;
      } catch {
        return false;
      }
    });
    if (!card) {
      throw new Error(`resolveSlotAssemblyPredictionOptions: no card resolves to archetype "${archetypeKey}"`);
    }
    return { key: archetypeKey, label: card.text };
  });
}

/**
 * `DigLayer.prediction.options` stores hand CARD IDS directly — simpler than the slot-assembly
 * case, since a dig layer has no wildcard matching to work around.
 */
export function resolveDigLayerPredictionOptions(layer: DigLayer, prompt: PredictionPrompt): PredictionOption[] {
  return prompt.options.map((cardId) => {
    const card = layer.hand.find((c) => c.id === cardId);
    if (!card) {
      throw new Error(`resolveDigLayerPredictionOptions: no hand card with id "${cardId}" in this layer`);
    }
    return { key: cardId, label: card.text };
  });
}
