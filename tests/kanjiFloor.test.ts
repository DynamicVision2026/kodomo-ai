import { describe, it, expect } from 'vitest';
import { checkKanjiFloor, KANJI_FLOOR } from '../pipeline/lib/kanjiFloor';
import { lintText } from '../pipeline/lib/lintText';
import { loadGradeMap } from '../pipeline/lib/kanji';

describe('AD-05 kanji floor — checkKanjiFloor (pure)', () => {
  it('rejects a representative Grade-1/2-style kana spelling standing alone', () => {
    const violations = checkKanjiFloor('なにが きこえる？');
    expect(violations.map((v) => v.kana)).toContain('なに');
  });

  it('rejects several different floor words in one sentence', () => {
    const violations = checkKanjiFloor('いま、そとで いぬが ないている');
    const kanas = violations.map((v) => v.kana);
    expect(kanas).toEqual(expect.arrayContaining(['いま', 'そと', 'いぬ']));
  });

  it('passes compliant Japanese that already uses the kanji floor', () => {
    expect(checkKanjiFloor('今、外で犬が鳴いている')).toEqual([]);
  });

  it('passes text that never mentions any floor word at all', () => {
    expect(checkKanjiFloor('「ちゃんと」って、どういういみ？')).toEqual([]);
  });

  it('does not confuse a floor word with an unrelated word that merely contains it as a substring — おなか must not be flagged for 「なか」', () => {
    const violations = checkKanjiFloor('おなかが すいたね。');
    expect(violations.map((v) => v.kana)).not.toContain('なか');
  });

  it('does not confuse grammatical/auxiliary kana with the floor — こと・とき・もの・ある・いる・わかる are never in the list', () => {
    const grammatical = ['こと', 'とき', 'もの', 'ある', 'いる', 'わかる', 'という', 'てみる'];
    for (const word of grammatical) {
      expect(KANJI_FLOOR.some((e) => e.kana === word)).toBe(false);
    }
  });

  it('does not flag なんで (the AD-05 naze realization) — casual "why" is natively kana, not a floor violation', () => {
    expect(checkKanjiFloor('なんで？')).toEqual([]);
  });

  it('every floor entry maps a kana reading to a kanji-bearing form', () => {
    for (const entry of KANJI_FLOOR) {
      expect(entry.kana).toMatch(/^[぀-ゟ]+$/); // pure hiragana
      expect(entry.kanji).toMatch(/[一-鿿㐀-䶿]/); // contains at least one kanji
    }
  });

  it('is approximately 50 entries, per AD-05 §4', () => {
    expect(KANJI_FLOOR.length).toBeGreaterThanOrEqual(45);
    expect(KANJI_FLOOR.length).toBeLessThanOrEqual(60);
  });
});

describe('AD-05 kanji floor — wired into lintText (stage-2 scoped, opt-in)', () => {
  const gradeOf = loadGradeMap();

  it('fails a stage-2 string using a floor kana spelling, when the caller opts in', () => {
    const issues = lintText('いま なにが きこえる？', 2, gradeOf, { kanjiFloor: true });
    expect(issues.some((i) => i.rule === 'kanji-floor')).toBe(true);
  });

  it('passes the same content once written with the kanji floor applied', () => {
    const issues = lintText('今何が聞こえる？', 2, gradeOf, { kanjiFloor: true })
      .filter((i) => i.rule === 'kanji-floor');
    expect(issues).toEqual([]);
  });

  it('is off by default — a caller that does not opt in gets no kanji-floor issues at all, even for violating text', () => {
    // This is what protects content authored before AD-05 existed (archived missions, the
    // shared print deck) from being retroactively broken by a new register policy — see
    // pipeline/04_lint.ts's lintMission, which opts in only for contentClass: "release".
    const issues = lintText('いま なにが きこえる？', 2, gradeOf);
    expect(issues.some((i) => i.rule === 'kanji-floor')).toBe(false);
  });

  it('does not apply the kanji floor outside stage 2, even opted in', () => {
    // Stage 1 has its own (stricter — no bare kanji at all) rules; the kanji-floor rule itself
    // must not fire there, whatever kanji-grade/ruby rules do independently.
    const issues = lintText('いま', 1, gradeOf, { kanjiFloor: true });
    expect(issues.some((i) => i.rule === 'kanji-floor')).toBe(false);
  });

  it('every KANJI_FLOOR kanji form is itself grade <=2 (bare-legal at stage 2, no ruby required)', () => {
    for (const entry of KANJI_FLOOR) {
      const issues = lintText(entry.kanji, 2, gradeOf, { kanjiFloor: true });
      expect(issues.filter((i) => i.rule === 'kanji-grade' || i.rule === 'ruby-required')).toEqual([]);
    }
  });
});
