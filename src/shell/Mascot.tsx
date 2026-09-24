import './mascot.css';

/**
 * WO-23 §12 (AD-06 D6/visual-kit.html reference): a stable mascot SLOT — a simple, functional
 * placeholder, not final illustration (explicitly out of this sprint's scope). The concept this
 * borrows from visual-kit.html: a fluffy blob with a curl over its head, reading as「？」at rest;
 * final art can replace this SVG in v0.7b without any consuming screen changing its `state` prop
 * contract.
 *
 * The mascot's role is always functional — reaction, curiosity, thinking, challenge/support,
 * discovery — never an omniscient judge (AD-06 §12): no state here means "correct" or
 * "incorrect," only a mood.
 */
export type MascotState = 'curious' | 'thinking' | 'challenge' | 'discovery' | 'reaction';

export interface MascotProps {
  state: MascotState;
  /** Accessible label — parent/child-facing, so it must come from the caller's own ui strings,
   *  never a hard-coded English word here (CI gate 3 scope). */
  label?: string;
}

const EYES: Record<MascotState, { l: string; r: string }> = {
  curious:   { l: 'M -6 -2 a 3 3 0 1 0 0.1 0', r: 'M 6 -2 a 3 3 0 1 0 0.1 0' },
  thinking:  { l: 'M -6 -1 q 2 -3 4 0', r: 'M 2 -1 q 2 -3 4 0' },
  challenge: { l: 'M -8 -2 L -3 -2', r: 'M 3 -2 L 8 -2' },
  discovery: { l: 'M -6 -3 a 3.4 3.4 0 1 0 0.1 0', r: 'M 6 -3 a 3.4 3.4 0 1 0 0.1 0' },
  reaction:  { l: 'M -6 -2 a 2.6 2.6 0 1 0 0.1 0', r: 'M 6 -2 a 2.6 2.6 0 1 0 0.1 0' },
};

// The curl above the blob — a question mark's own dot-and-curve. Snaps straighter for
// "discovery" (the moment a follow-up lands), stays curled everywhere else.
const CURL: Record<MascotState, string> = {
  curious: 'M 0 -30 C 0 -38 10 -38 10 -46 C 10 -54 -6 -55 -8 -47',
  thinking: 'M 0 -30 C 0 -37 9 -38 9 -45 C 9 -51 -2 -52 -3 -46 C -4 -42 2 -41 3 -45',
  challenge: 'M 0 -30 C 0 -38 10 -38 10 -46 C 10 -54 -6 -55 -8 -47',
  discovery: 'M 0 -30 L 0 -46',
  reaction: 'M 0 -30 C 0 -37 9 -38 9 -45 C 9 -52 -5 -53 -7 -46',
};

export function Mascot({ state, label }: MascotProps) {
  const eyes = EYES[state];
  return (
    <svg
      className={`mascot mascot--${state}`}
      viewBox="-40 -60 80 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* WO-28 §5: a soft gradient in place of a flat fill — pure visual polish, referenced only
         from mascot.css (`fill: url(#mascot-body-gradient)`), never changes what state means.
         AD-12 (post-launch-check work order): the old cream/tan stops (#fffaf0/#fbe4b8) read as
         the pre-AD-12 theme — tan is reserved for ポン太 only, and this mascot isn't ポン太 (it
         renders on CourseHome/MissionComplete/MissionStage's actor row, never as ポン太 itself).
         White-to-field-1 keeps the same soft roundness cue without any cream/tan tone. */}
      <defs>
        <radialGradient id="mascot-body-gradient" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e3e6f0" />
        </radialGradient>
      </defs>
      <ellipse cx="0" cy="34" rx="20" ry="3" className="mascot__shadow" />
      <path d={CURL[state]} className="mascot__curl" fill="none" strokeLinecap="round" strokeWidth="3" />
      {state === 'discovery' && <circle cx="0" cy="-49" r="2.4" className="mascot__curl-dot" />}
      <ellipse cx="0" cy="8" rx="28" ry="26" className="mascot__body" />
      <path d={eyes.l} className="mascot__eye" strokeLinecap="round" strokeWidth="2.4" fill="none" />
      <path d={eyes.r} className="mascot__eye" strokeLinecap="round" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
