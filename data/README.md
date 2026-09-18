# data/

## kyoiku-kanji.json

The validated 1,026-character 学年別漢字配当表 (教育漢字), one array per grade:

```json
{ "1": ["一", "右", "..."], "2": ["..."], "3": ["..."], "4": ["..."], "5": ["..."], "6": ["..."] }
```

`pipeline/lib/kanji.ts` (`loadGradeMap`) requires the total across all six grades to be
exactly 1026; `pipeline/04_lint.ts` refuses to run without this file.

### Source

Transcribed from the current 別表 学年別漢字配当表 in 小学校学習指導要領（平成29年告示）
国語, MEXT, as summarized at https://www.mext.go.jp/a_menu/shotou/cs/1320015.htm — in force
since full implementation on 2020-04-01 (the 2017 revision added the 20 prefecture-name kanji
to Grade 4, raising the pre-2020 total of 1006 to the current 1026).

Direct network access to mext.go.jp was blocked in the environment this table was built in, so
the character list itself was supplied by the founder (transcribed from the official table) and
verified here rather than fetched by pipeline code. Validation performed on import:
- Per-grade counts match the official 80/160/200/202/193/191 split exactly (checked
  programmatically against the table below).
- No duplicate characters within or across grades (1026 unique characters).
- Grade 4's list matches, character-for-character, the excerpt published in a curriculum
  transition-guidance PDF from a second, independent source (an educational publisher's 移行措置
  materials, itself sourced from the same MEXT appendix), spot-checked for the block of
  prefecture-name kanji introduced in the 2017 revision.

If this file is ever regenerated, re-run the same checks (per-grade counts, no duplicates,
total 1026) before committing — they are cheap and catch transcription errors immediately.
