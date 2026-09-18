import { rubyCoverage } from './ruby.js';
import { isKanji, STAGE_LIMITS, type GradeMap } from './kanji.js';

export interface LintIssue { rule: string; message: string; text: string }

/** Words that must never appear in child-facing content. Spec v0.5 §6. */
export const BANNED = [
  '正解', '不正解', 'まちがい', 'バカ', 'テスト', '点数',
  '追問', '第一性原理',                    // internal design terms — never customer-facing
  '文部科学省推奨', '文科省推奨', '認定', '公認', '準拠', '監修', // §1A forbidden endorsement claims
];

/** PII prompts that must never be requested anywhere. */
export const PII_WORDS = ['名前をいれ', 'なまえをいれ', '住所', 'じゅうしょ', '学校名', 'メールアドレス', '電話'];

export function lintText(text: string, stage: number, gradeOf: GradeMap): LintIssue[] {
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

  return issues;
}
