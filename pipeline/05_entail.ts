/**
 * 05 — ENTAILMENT. Catches simplification drift: does each robotSays line say ONLY what its
 * claim ids support? Flags for a human; never edits. (Spec v0.5 §6.)
 *
 * The literature is clear that simplification inserts and distorts facts, and that no single
 * automated check is reliable — so this is a filter in front of Gate 1/Gate 2, not a guarantee.
 *
 * Usage: npx tsx pipeline/05_entail.ts <topic-slug> --stage 2
 * TODO(implementer): model call; output a report file, exit non-zero only on "contradicts".
 */
console.error('05_entail: not yet wired to a model. See the TODO in this file.');
process.exit(1);
