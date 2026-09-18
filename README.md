# kodomo-ai — ナゼホリ（仮）

Module 1 · Stage 2 (小学3・4年生). Build against `docs/spec-v0.5.md`. That spec is the source of
truth; ambiguities are escalated to the architect, not resolved by the implementer.

**This repository should be private until launch.**

## What this is
A static web app that teaches children to keep asking — 問う → 浅い答え → もう一問 → ねっこ.

## Non-negotiables
- **No LLM at runtime.** Every answer ships as pre-written, fact-checked content.
- **No free-text input** anywhere in the child flow. Children select cards.
- **No PII.** Preset avatar + preset nickname + a stage number. Nothing else, ever.
- **AI never approves content.** Two human gates: founder approves each claim, native speaker
  reviews each batch.

## Quick start
```bash
npm install
npm test                 # engine unit tests
npm run gates            # every CI gate, in order
npm run dev              # LP at /, app at /play, deck at /print/deck
```

## Before anything else
1. `data/kyoiku-kanji.json` — export the validated 1,026-character grade table from the SENJI
   repo. The content lint refuses to run without it. See `data/README.md`.
2. `src/modules/m1/topics/bread/facts.yaml` is a PLACEHOLDER with `status: pending`, so
   `npm run gate:claims` fails by design. Replace it with real pipeline output and approve each
   claim. **A green `gate:claims` is the signal that Gate 1 actually happened.**

## Layout
```
src/engine      state, resolver, dig machine, ruby, storage, entitlements, analytics
src/ui          Card.tsx — one component for app and print deck
src/templates   slot-assembly · dig · prediction-battle · handoff
src/modules/m1  module.json, deck.s2.json, topics/<topic>/{facts.yaml,s2.json}
pipeline        01 research · 02 crosscheck · 03 render · 04 lint · 05 entail · tag_audit
scripts         CI gates
```

## Rules the engine must keep
- The engine never imports module content by name.
- Resolvers match on **tags**, never card ids.
- Only a `deepen` card advances a dig layer.
- Child-facing Japanese lives in module JSON only.
