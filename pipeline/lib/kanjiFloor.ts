/**
 * AD-05 §4 — the Stage-2 "kanji floor": a compact, lintable list of common content words whose
 * NORMAL adult/children's-book written form uses only bare-legal-at-Stage-2 kanji (Grade 1-2,
 * per pipeline/lib/kanji.ts's STAGE_LIMITS.bareUpTo), and which should therefore never be spelled
 * out in Grade-1/2-style all-kana child-visible copy — that spacing/kana-only habit is exactly
 * what AD-05 asks to be removed ("remove Grade-1/2-style word spacing where kanji should
 * naturally provide boundaries").
 *
 * This does NOT implement a general kanji-usage checker. It is deliberately narrow: every entry
 * below is a word I am confident is conventionally written in kanji even in children's materials
 * — ordinary nouns, a few unambiguous verbs in their bare dictionary form, and a few adjectives.
 *
 * Deliberately EXCLUDED, and never added here without a native-speaker review overriding this
 * comment — words whose normal convention is to STAY in kana even in adult writing, where an
 * automated "add kanji" rule would be wrong, not helpful:
 *   - grammatical/nominalizing kana: こと, とき, もの, わけ, ため, よう, はず, つもり
 *   - auxiliary/light-verb uses: ある, いる, できる, なる, くれる, あげる, もらう, みる (as
 *     "-てみる"), いく/くる (as "-ていく"/"-てくる"), いう (esp. the grammaticalized 「という」)
 *   - words conventionally kana even as main content words: わかる, うち (as "my
 *     home/family" — genuinely ambiguous with 内 "inside," and AD-05 §6 itself calls for a
 *     native-equivalent formulation rather than a fixed kanji choice here)
 *   - casual interjection-register words AD-05 itself specifies as their natural (kana) form:
 *     なんで (the naze realization) — casual "why" stays kana even in adult casual writing;
 *     writing 何で here would be a register error, not a correction.
 *
 * Matching strategy (checkKanjiFloor, below): rather than naive substring search — which would
 * misfire on words like おなか ("tummy," conventionally kana) merely containing なか, or おうち
 * containing うち — each entry's kana spelling is matched only at a plausible WORD boundary:
 *   - not immediately preceded by another hiragana character (blocks おなか matching なか, since
 *     お is hiragana and would normally be part of the same word, not a separate preceding word);
 *   - immediately followed by either the end of the string, a non-hiragana character
 *     (punctuation, kanji, whitespace), or one of a small set of common particles/copula (は, が,
 *     を, に, で, と, も, の, や, か, ね, よ, だ, です, ます, から, まで, より, けど, し) — so a
 *     bare floor word glued directly to a following particle (そとで, なにが, …) is still caught.
 * This does not catch every inflected form (conjugations change the kana entirely, e.g. きいて/
 * きいた for 聞く), which is a known, accepted limitation, not a claim of exhaustive grammatical
 * coverage — the goal is a lint that never wrongly flags legitimate kana, even at the cost of
 * missing some kanji-floor violations a native reviewer would still catch by eye.
 */

export interface KanjiFloorEntry {
  /** The all-kana spelling that should not appear as a standalone word/chunk in child-visible
   *  Stage-2 copy — its bare-legal-kanji form should be used instead. */
  kana: string;
  /** The correct written form (kanji + any trailing kana for conjugation/okurigana). */
  kanji: string;
}

export const KANJI_FLOOR: readonly KanjiFloorEntry[] = [
  // Basic question/reference words
  { kana: 'なに', kanji: '何' },
  { kana: 'いま', kanji: '今' },
  { kana: 'そと', kanji: '外' },
  // Body parts (single-mora body-part readings — て/め/き(気)/ひ(as 日) etc. — are deliberately
  // excluded: a lone kana character is far too likely to be the conjugation/okurigana tail of an
  // unrelated word, e.g. き(木) inside 聞き, or て(手) inside every -te-form verb. Found by
  // testing: き(木) flagged inside 聞き方, a false positive. Two-or-more-mora entries only.)
  { kana: 'くち', kanji: '口' },
  { kana: 'あたま', kanji: '頭' },
  { kana: 'からだ', kanji: '体' },
  { kana: 'かお', kanji: '顔' },
  // Nature
  { kana: 'みず', kanji: '水' },
  { kana: 'そら', kanji: '空' },
  // Time/calendar. よる(夜) is deliberately excluded — see the Verbs section comment below:
  // it collides with よる/による ("depends on"), a completely different, common word.
  { kana: 'とし', kanji: '年' },
  { kana: 'あさ', kanji: '朝' },
  { kana: 'ひる', kanji: '昼' },
  { kana: 'まいにち', kanji: '毎日' },
  // Family
  { kana: 'ちち', kanji: '父' },
  { kana: 'はは', kanji: '母' },
  { kana: 'ともだち', kanji: '友だち' },
  // Animals
  { kana: 'いぬ', kanji: '犬' },
  // People/places
  { kana: 'ひと', kanji: '人' },
  { kana: 'おとこ', kanji: '男' },
  { kana: 'おんな', kanji: '女' },
  { kana: 'こども', kanji: '子ども' },
  { kana: 'がっこう', kanji: '学校' },
  { kana: 'せんせい', kanji: '先生' },
  { kana: 'まち', kanji: '町' },
  // Objects/misc nouns
  { kana: 'くるま', kanji: '車' },
  { kana: 'ほん', kanji: '本' },
  { kana: 'なまえ', kanji: '名前' },
  { kana: 'ちから', kanji: '力' },
  { kana: 'はなし', kanji: '話' },
  { kana: 'こたえ', kanji: '答え' },
  // Colors/adjectives
  { kana: 'あかい', kanji: '赤い' },
  { kana: 'あおい', kanji: '青い' },
  { kana: 'しろい', kanji: '白い' },
  { kana: 'おおきい', kanji: '大きい' },
  { kana: 'ちいさい', kanji: '小さい' },
  { kana: 'はやい', kanji: '早い' },
  { kana: 'ながい', kanji: '長い' },
  { kana: 'あかるい', kanji: '明るい' },
  { kana: 'おなじ', kanji: '同じ' },
  { kana: 'あたらしい', kanji: '新しい' },
  // Verbs (bare dictionary form only — see module comment on inflection coverage).
  // Deliberately EXCLUDED despite being grade<=2, found by testing against real content:
  //   きく (聞く) — collides with 大きく/おおきく (the adverbial form of 大きい/おおきい), which
  //     contains きく as its last two morae; flagged in ice/s2.json's own existing text.
  //   よる (夜) — collides with よる/による ("depends on/due to," a common grammaticalized verb),
  //     a completely different word with the same spelling; flagged in ice/s2.json's own text.
  //   かえる (帰る) — かえる is a classic multi-homonym kana string (帰る/変える/替える/代える,
  //     and the potential form of 買う), too collision-prone for a spelling-only checker.
  { kana: 'よむ', kanji: '読む' },
  { kana: 'かう', kanji: '買う' },
  { kana: 'うる', kanji: '売る' },
  { kana: 'こたえる', kanji: '答える' },
  { kana: 'あるく', kanji: '歩く' },
  { kana: 'とおる', kanji: '通る' },
  { kana: 'たべる', kanji: '食べる' },
  { kana: 'かんがえる', kanji: '考える' },
  { kana: 'おしえる', kanji: '教える' },
] as const;

const HIRAGANA_CLASS = '\\u3040-\\u309F';
const PARTICLES = ['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'や', 'か', 'ね', 'よ', 'だ',
  'です', 'ます', 'でした', 'ました', 'から', 'まで', 'より', 'けど', 'し'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary-aware matcher for one floor entry — see the module comment for the reasoning. */
function buildEntryRegex(kana: string): RegExp {
  const notPrecededByHiragana = `(?<![${HIRAGANA_CLASS}])`;
  const followedByBoundary = `(?=$|[^${HIRAGANA_CLASS}]|${PARTICLES.map(escapeRegExp).join('|')})`;
  return new RegExp(`${notPrecededByHiragana}${escapeRegExp(kana)}${followedByBoundary}`);
}

export interface KanjiFloorViolation {
  kana: string;
  kanji: string;
}

/** Returns every KANJI_FLOOR entry whose kana spelling appears in `text` at a plausible word
 *  boundary — i.e. child-visible copy that should have used the kanji form instead. Empty array
 *  = compliant (or the word never appears in bare dictionary form, which this checker does not
 *  claim to catch — see the module comment). */
export function checkKanjiFloor(text: string): KanjiFloorViolation[] {
  const violations: KanjiFloorViolation[] = [];
  for (const entry of KANJI_FLOOR) {
    if (buildEntryRegex(entry.kana).test(text)) violations.push(entry);
  }
  return violations;
}
