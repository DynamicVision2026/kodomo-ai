import type { MoveProgressMap, ScaffoldRung } from '../engine/scaffold';
import './toolbox.css';

export interface ToolboxProps {
  /** The accepted Stage-2 follow moves this module ships — module.json's own `followMoves`,
   *  never a second hard-coded move list (WO-05). */
  followMoves: string[];
  /** Move id -> display label, from module.json's `cardTypes` — the same source Card.tsx and
   *  PrintDeck.tsx already read labels from; never hard-coded here (gate:no-hardcoded-copy). */
  cardTypes: Record<string, { label: string }>;
  /** The active profile's persisted per-move progression (WO-04). Absent entirely on a
   *  legacy/new profile — every move then renders undiscovered. */
  moveProgress: MoveProgressMap;
  heading: string;
}

const RUNG_CLASS: Record<ScaffoldRung, string> = {
  mihakken: 'toolbox__tool--undiscovered',
  moratta: 'toolbox__tool--obtained',
  tsukaeru: 'toolbox__tool--usable',
  // Representable, never produced by WO-04's evidence — later tickets' rungs.
  hitoride: 'toolbox__tool--independent',
  sotode: 'toolbox__tool--outside',
};

/**
 * WO-05: 問いのどうぐばこ — a growth surface, not a scorecard. Renders each of the module's
 * accepted follow moves at its current scaffold rung, read-only, straight from the active
 * profile's existing `moveProgress` (src/engine/scaffold.ts owns the deterministic rules this
 * only displays — no second progression system, no score/percentage/domain-count UI, no
 * pass/fail language). A move with no entry in `moveProgress` renders exactly like `mihakken`.
 */
export function Toolbox({ followMoves, cardTypes, moveProgress, heading }: ToolboxProps) {
  return (
    <div className="toolbox">
      <p className="toolbox__heading">{heading}</p>
      <ul className="toolbox__tools">
        {followMoves.map((move) => {
          const rung = moveProgress[move]?.rung ?? 'mihakken';
          return (
            <li key={move} className={`toolbox__tool ${RUNG_CLASS[rung]}`}>
              <span className="toolbox__tool-icon" aria-hidden="true" />
              <span className="toolbox__tool-label">{cardTypes[move]?.label ?? move}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
