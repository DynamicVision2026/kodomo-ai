/**
 * Family code format: NAZE-XXXX-XXXX. Alphabet excludes 0/O and 1/I/L — the two pairs most
 * often misread out loud or mistyped from a printed receipt/email.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUP_LEN = 4;
const GROUPS = 2;

export function generateFamilyCode(): string {
  const bytes = new Uint8Array(GROUP_LEN * GROUPS);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) {
    groups.push(chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(''));
  }
  return `NAZE-${groups.join('-')}`;
}

// Built from ALPHABET itself, not a generic [A-Z0-9] — a code using an excluded character
// (0, O, 1, I, L) can never have been legitimately issued, so it's rejected by shape alone.
const CODE_SHAPE = new RegExp(`^NAZE(-[${ALPHABET}]{${GROUP_LEN}}){${GROUPS}}$`);

/** Normalizes user/email-pasted input (case, stray whitespace) before a KV lookup. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isWellFormedCode(code: string): boolean {
  return CODE_SHAPE.test(code);
}
