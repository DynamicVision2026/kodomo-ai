import { rubyCoverage } from './ruby.js';
import { isKanji, STAGE_LIMITS, type GradeMap } from './kanji.js';
import { checkKanjiFloor } from './kanjiFloor.js';

export interface LintIssue { rule: string; message: string; text: string }

/** Words that must never appear in child-facing content. Spec v0.5 §6. */
export const BANNED = [
  '正解', '不正解', 'まちがい', 'バカ', 'テスト', '点数',
  '追問', '第一性原理',                    // internal design terms — never customer-facing
  '文部科学省推奨', '文科省推奨', '認定', '公認', '準拠', '監修', // §1A forbidden endorsement claims
];

/** PII prompts that must never be requested anywhere. */
export const PII_WORDS = ['名前をいれ', 'なまえをいれ', '住所', 'じゅうしょ', '学校名', 'メールアドレス', '電話'];

export interface LintTextOptions {
  /** AD-05 §4 (WO-14): the Stage-2 kanji floor. Opt-in and off by default — deliberately NOT
   *  applied retroactively to content authored before AD-05 existed (archived missions like
   *  bread/ice, and the shared printable deck, which has no contentClass of its own) or to
   *  synthetic fixtures. Callers that DO want it enabled (04_lint.ts's lintMission, for a mission
   *  whose own contentClass is "release") pass `kanjiFloor: true` explicitly. This is a lint-call
   *  option, not a content-schema change — no mission JSON shape changed to support it. */
  kanjiFloor?: boolean;
}

export function lintText(text: string, stage: number, gradeOf: GradeMap, opts: LintTextOptions = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  const limits = STAGE_LIMITS[stage];
  if (!limits) return [{ rule: 'stage', message: `Unknown stage ${stage}`, text }];

  const { base, annotated } = rubyCoverage(text);

  for (const ch of base) {
    if (!isKanji(ch)) continue;
    const grade = gradeOf.get(ch) ?? 7;
    if (grade > limits.allowedUpTo) {
      issues.push({ rule: 'kanji-grade', message: `「${ch}」is grade ${grade === 7 ? '表外' : grade}, above stage ${stage} limit ${limits.allowedUpTo}`, text });
    } else if (grade > limits.bareUpTo && !annotated.has(ch)) {
      issues.push({ rule: 'ruby-required', message: `「${ch}」is grade ${grade} and needs ruby at stage ${stage}`, text });
    }
  }

  if (base.length > limits.maxSentence) {
    issues.push({ rule: 'length', message: `${base.length} chars > stage ${stage} limit ${limits.maxSentence}`, text });
  }
  for (const w of BANNED) if (base.includes(w)) issues.push({ rule: 'banned-word', message: `contains 「${w}」`, text });
  for (const w of PII_WORDS) if (base.includes(w)) issues.push({ rule: 'pii-word', message: `asks for personal data: 「${w}」`, text });

  // AD-05 §4 (WO-14): the Stage-2 kanji floor — scoped to stage 2 AND to callers that opt in.
  if (stage === 2 && opts.kanjiFloor) {
    for (const v of checkKanjiFloor(text)) {
      issues.push({ rule: 'kanji-floor', message: `「${v.kana}」should be written 「${v.kanji}」 (AD-05 kanji floor)`, text });
    }
  }

  return issues;
}
