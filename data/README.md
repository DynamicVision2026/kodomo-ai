# data/

## kyoiku-kanji.json — REQUIRED, NOT YET PRESENT

The kanji lint needs the validated 1,026-character 学年別漢字配当表 already built and
checked in the SENJI repo (character-level table, 80/160/200/202/193/191).

Export it from SENJI into this shape and commit it here:

```json
{ "1": ["一", "右", "..."], "2": ["..."], "3": ["..."], "4": ["..."], "5": ["..."], "6": ["..."] }
```

Until it exists, `pipeline/04_lint.ts` FAILS LOUDLY rather than passing content unchecked.
Do not hand-type a partial table — the whole point of reusing SENJI's is that it is validated.
