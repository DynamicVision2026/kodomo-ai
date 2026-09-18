import type { ReactNode } from 'react';

/**
 * Parses {漢字|かんじ} into <ruby>漢字<rt>かんじ</rt></ruby>.
 * Spec v0.5 §3: Stage 2 shows ruby on every kanji above Grade 2.
 * Content authors write the markup; the kanji lint (pipeline/04) enforces that it is present.
 */
const TOKEN = /\{([^{}|]+)\|([^{}|]+)\}/g;

export function renderRuby(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let i = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <ruby key={`r${i++}`}>
        {m[1]}
        <rt>{m[2]}</rt>
      </ruby>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Strips ruby markup, leaving base text. Used by lints and by the print deck's plain mode. */
export function stripRuby(text: string): string {
  return text.replace(TOKEN, (_all, base: string) => base);
}

/** Returns base text with readings removed AND the set of annotated characters. */
export function rubyCoverage(text: string): { base: string; annotated: Set<string> } {
  const annotated = new Set<string>();
  const base = text.replace(TOKEN, (_all, b: string) => {
    for (const ch of b) annotated.add(ch);
    return b;
  });
  return { base, annotated };
}

export function Ruby({ text }: { text: string }) {
  return <>{renderRuby(text)}</>;
}
