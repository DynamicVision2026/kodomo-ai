import { useState } from 'react';
import type { Archetype, SlotAssemblyPhase, SlotId } from '../../engine/types';
import { resolveArchetype } from '../../engine/resolver';
import { Card, type CardKind } from '../../ui/Card';
import { Ruby } from '../../engine/ruby';
import { track } from '../../engine/analytics';
import './slot-assembly.css';

export interface SlotAssemblyResult {
  archetypeKey: string;
  retries: number;
}

export interface SlotAssemblyProps {
  phase: SlotAssemblyPhase;
  onComplete: (result: SlotAssemblyResult) => void;
}

/**
 * An archetype backed by a real claim ends the round; ['nonfactual'] claims (spec v0.5 §7 —
 * flavour text) are the vague/offtopic dead ends the player must retry past. This is the only
 * signal in the content schema that distinguishes "the question was clear enough" from
 * "try again" — there is no separate terminal flag.
 */
function isTerminal(archetype: Archetype): boolean {
  return archetype.claims.some((c) => c !== 'nonfactual');
}

export function SlotAssembly({ phase, onComplete }: SlotAssemblyProps) {
  const [chosen, setChosen] = useState<Record<SlotId, string | undefined>>({});
  const [resolved, setResolved] = useState<{ key: string; archetype: Archetype } | null>(null);
  const [changed, setChanged] = useState<Set<SlotId>>(new Set());
  const [retries, setRetries] = useState(0);
  const [done, setDone] = useState(false);
  const [lastChosen, setLastChosen] = useState<Record<SlotId, string | undefined>>({});

  function pick(slot: SlotId, cardId: string) {
    if (done) return;
    const next = { ...chosen, [slot]: cardId };
    setChosen(next);
    if (!phase.slots.every((s) => next[s])) return;

    const result = resolveArchetype(phase, next);
    const round = resolved === null ? 0 : retries + 1;
    setRetries(round);
    setResolved(result);
    setChanged(round === 0 ? new Set() : new Set(phase.slots.filter((s) => next[s] !== lastChosen[s])));
    setLastChosen(next);
    track('round_complete', { archetype: result.key, retries: round });

    if (isTerminal(result.archetype)) {
      setDone(true);
      onComplete({ archetypeKey: result.key, retries: round });
    }
  }

  return (
    <div className="slot-assembly">
      {phase.slots.map((slot) => (
        <div key={slot} className="slot-assembly__row">
          {phase.cards
            .filter((c) => c.slot === slot)
            .map((c) => (
              <Card
                key={c.id}
                kind={slot as CardKind}
                text={c.text}
                selected={chosen[slot] === c.id}
                disabled={done}
                onClick={() => pick(slot, c.id)}
              />
            ))}
        </div>
      ))}

      {resolved && (
        <div className={`slot-assembly__reaction${changed.size ? ' is-changed' : ''}`}>
          <p className="slot-assembly__robot-says">
            <Ruby text={resolved.archetype.robotSays} />
          </p>
          {resolved.archetype.tip && (
            <p className="slot-assembly__tip">
              <Ruby text={resolved.archetype.tip} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
