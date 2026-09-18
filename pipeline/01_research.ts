/**
 * 01 — RESEARCH. Drafts a topic's causal chain as atomic claims with sources.
 * Writes facts.yaml with every claim status: "pending". AI NEVER approves (spec v0.5 §6).
 *
 * Usage: npx tsx pipeline/01_research.ts <topic-slug> "<question in Japanese>"
 *
 * TODO(implementer): wire to the model of choice. Rules the prompt must enforce:
 *   - 4-6 atomic claims, ordered shallow -> deep, each independently checkable
 *   - EVERY claim needs a source URL from SOURCE_WHITELIST plus the supporting excerpt
 *   - at least one ADULT-level source per claim (child sites are already simplified)
 *   - facts only: never copy explanatory wording
 *   - claims are written language-neutral for Gate 1; Japanese child wording comes at 03
 */
export const SOURCE_WHITELIST = [
  'nhk.or.jp', 'kids.gakken.co.jp', 'jma.go.jp', 'jaxa.jp', 'kahaku.go.jp',
  'go.jp', 'ac.jp', 'britannica.com',
];

export interface Claim {
  id: string;            // c1, c2, ...
  statement: string;     // language-neutral, atomic
  sourceUrl: string;
  excerpt: string;
  adultLevelSource: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  crosscheck?: { verdict: 'supported' | 'weak' | 'unsupported'; note: string };
}

export interface FactsFile {
  topic: string;
  question: string;
  claims: Claim[];
}

console.error('01_research: not yet wired to a model. See the TODO in this file.');
process.exit(1);
