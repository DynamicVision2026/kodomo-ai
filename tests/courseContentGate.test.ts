/** WO-C1 §5: unit coverage for the course content gate's pure logic (scripts/lib/courseContentGate.ts). */
import { describe, it, expect } from 'vitest';
import { checkCourseLesson, isFullyApproved, redactToolNamesForKanjiFloor } from '../scripts/lib/courseContentGate';
import type { GradeMap } from '../pipeline/lib/kanji';
import type { CourseLesson } from '../src/course/content/types';

const gradeOf: GradeMap = new Map(); // empty grade map -> every kanji treated as grade 7 (表外)

function baseLesson(overrides: Partial<CourseLesson> = {}): CourseLesson {
  return {
    id: 'c01',
    title: 'げんきに あそぼう',
    tools: ['A'],
    practice: 'single',
    review: { model: 'pass', philosophy: null, japanese: null },
    listen: [{
      tool: 'A',
      audio: 'a.mp3',
      transcript: [{ speaker: 'ポン太', text: 'こんにちは' }],
      methodCards: ['A'],
      thenExercises: ['c01-e01'],
      toolCard: { when: '', how: '' },
    }],
    exercises: [
      {
        id: 'c01-e01',
        tool: 'A',
        scene: { text: 'ばめん' },
        q0: { speaker: 'ポン太', text: 'しつもん' },
        steps: [{
          answer: { speaker: 'おかあさん', text: 'げんきに あそぼうね' },
          hint: { h1: 'ひんと', h2Highlight: 'げんきに' },
          options: [{ id: 'a', role: 'best', kind: 'question', tool: 'A', text: 'しつもん', reply: { speaker: 'おかあさん', text: 'へんじ' }, feedback: 'ふぃーどばっく' }],
        }],
        review: { model: 'pass', philosophy: null, japanese: null },
      },
    ],
    make: [],
    teachBack: { prompt: 'ぷろんぷと' },
    family: { whoKnows: '', aiExample: '', applyTool: '', notes: [] },
    parentCard: { tool: '', method: '', sources: [], dinnerQuestion: '' },
    ...overrides,
  };
}

describe('isFullyApproved', () => {
  it('requires BOTH philosophy and japanese approved', () => {
    expect(isFullyApproved({ model: 'pass', philosophy: 'approved', japanese: 'approved' })).toBe(true);
    expect(isFullyApproved({ model: 'pass', philosophy: 'approved', japanese: null })).toBe(false);
    expect(isFullyApproved({ model: 'pass', philosophy: null, japanese: 'approved' })).toBe(false);
    expect(isFullyApproved(null)).toBe(false);
    expect(isFullyApproved(undefined)).toBe(false);
  });
});

describe('checkCourseLesson — approvalIssues (WO-C1 §5: "fails the build ... in a production build")', () => {
  it('non-strict: an unapproved lesson never produces approvalIssues', () => {
    const result = checkCourseLesson(baseLesson(), gradeOf, { strict: false });
    expect(result.approvalIssues).toEqual([]);
  });

  it('strict: an unapproved lesson fails', () => {
    const result = checkCourseLesson(baseLesson(), gradeOf, { strict: true });
    expect(result.approvalIssues.length).toBeGreaterThan(0);
  });

  it('strict: a fully-approved lesson with a fully-approved exercise passes', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
    });
    lesson.exercises[0]!.review = { model: 'pass', philosophy: 'approved', japanese: 'approved' };
    const result = checkCourseLesson(lesson, gradeOf, { strict: true });
    expect(result.approvalIssues).toEqual([]);
  });

  it('strict: a lesson approved overall but with one unapproved exercise still fails, naming the exercise', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
    });
    // exercise review left at null/null
    const result = checkCourseLesson(lesson, gradeOf, { strict: true });
    expect(result.approvalIssues.some((i) => i.includes('c01-e01'))).toBe(true);
  });

  it('strict: listenReview is checked the same way when present, naming "listen"', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      listenReview: { model: 'pass', philosophy: 'approved', japanese: null },
    });
    lesson.exercises[0]!.review = { model: 'pass', philosophy: 'approved', japanese: 'approved' };
    const result = checkCourseLesson(lesson, gradeOf, { strict: true });
    expect(result.approvalIssues.some((i) => i.includes('listen'))).toBe(true);
  });

  it('strict: a lesson with no listenReview at all (predates WO-C2) is never penalised for it', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
    });
    lesson.exercises[0]!.review = { model: 'pass', philosophy: 'approved', japanese: 'approved' };
    const result = checkCourseLesson(lesson, gradeOf, { strict: true });
    expect(result.approvalIssues).toEqual([]);
  });
});

describe('checkCourseLesson — content lint gating (approved lessons only fail on lint issues)', () => {
  it('an unapproved lesson with lint problems gets warnings, never failures', () => {
    const lesson = baseLesson({ title: 'x'.repeat(50) }); // way over any sentence-length limit
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues).toEqual([]);
    expect(result.contentLintWarnings.length).toBeGreaterThan(0);
  });

  it('a FULLY APPROVED lesson with the same lint problem fails instead', () => {
    const lesson = baseLesson({
      title: 'x'.repeat(50),
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.length).toBeGreaterThan(0);
    expect(result.contentLintWarnings).toEqual([]);
  });

  it('banned/PII words are caught even in parent-facing fields (family/parentCard)', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      family: { whoKnows: '住所を きいて みよう', aiExample: '', applyTool: '', notes: [] },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('pii-word'))).toBe(true);
  });

  it('a clean, short, approved lesson produces no lint issues', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      teachBack: { prompt: 'げんきに はなそう' }, // avoids kanji-floor words like こたえ/なに
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues).toEqual([]);
  });
});

describe('checkCourseLesson — sentence-length is per-sentence, not per-string (Coordinator correction)', () => {
  it('two short sentences that together exceed 35 chars produce no length warning', () => {
    // 20 chars + 20 chars = 40 (over 35 as one string), but neither sentence alone is.
    const sentenceA = 'あ'.repeat(20) + '。';
    const sentenceB = 'い'.repeat(20) + '。';
    const lesson = baseLesson({ teachBack: { prompt: sentenceA + sentenceB } });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintWarnings.some((w) => w.includes('[length]'))).toBe(false);
  });

  it('one sentence over 35 chars is still caught, quoting the offending sentence', () => {
    const longSentence = 'あ'.repeat(40) + '。';
    const lesson = baseLesson({ teachBack: { prompt: longSentence } });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    const hit = result.contentLintWarnings.find((w) => w.includes('[length]'));
    expect(hit).toBeDefined();
    expect(hit).toContain(longSentence);
  });

  it('a text with no terminal punctuation is treated as one sentence (unchanged from before)', () => {
    const lesson = baseLesson({ title: 'x'.repeat(50) });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintWarnings.some((w) => w.includes('[length]'))).toBe(true);
  });

  it('parentCard/family.aiExample are never length-checked (parent-facing, per Coordinator)', () => {
    const lesson = baseLesson({
      family: { whoKnows: '', aiExample: 'あ'.repeat(60), applyTool: '', notes: [] },
      parentCard: { tool: 'あ'.repeat(60), method: '', sources: [], dinnerQuestion: '' },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintWarnings.some((w) => w.includes('[length]'))).toBe(false);
  });
});

describe('checkCourseLesson — PII allowlist (Coordinator: exact-match only, no loosened lint)', () => {
  it('the approved family.notes safety sentence is never flagged as pii-word', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      family: { whoKnows: '', aiExample: '', applyTool: '', notes: ['AIには、名前や学校名、じゅうしょを入れない'] },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('pii-word'))).toBe(false);
  });

  it('a DIFFERENT sentence merely containing the same PII words is still flagged (exact-match only)', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      family: { whoKnows: '', aiExample: '', applyTool: '', notes: ['学校名を きいて みよう'] },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('pii-word'))).toBe(true);
  });

  it('the WO-C2 family.parentNote safety sentence is never flagged, even mixed with other sentences', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      family: {
        whoKnows: '', aiExample: '', applyTool: '', notes: [],
        parentNote: 'AIはおうちの方が操作してください。お子さんの名前・学校名・住所などは入力しないでください。AIの答えは参考の一つとして、家族で話し合ってください。',
      },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('pii-word'))).toBe(false);
  });

  it('a DIFFERENT sentence in the same multi-sentence field is still independently flagged', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      family: {
        whoKnows: '', aiExample: '', applyTool: '', notes: [],
        parentNote: 'お子さんの名前・学校名・住所などは入力しないでください。住所を教えてください。',
      },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.filter((i) => i.includes('pii-word')).length).toBe(1);
  });
});

describe('checkCourseLesson — banned-word allowlist (Coordinator: exact-match only, same discipline as PII)', () => {
  it('the approved make.parentNote "not a scored answer" sentence is never flagged as banned-word', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      make: [{
        tool: 'A', methodCard: 'A', dialogue: [], starterCards: [], parentPrompts: [], selfCheck: [],
        parentPeek: [], parentNote: '正解を言わせる場面ではありません。お子さんが声に出した問いを、そのまま受け止めてください。',
      }],
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('banned-word'))).toBe(false);
  });

  it('a DIFFERENT sentence merely containing the same banned word is still flagged (exact-match only)', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      make: [{
        tool: 'A', methodCard: 'A', dialogue: [], starterCards: [], parentPrompts: [], selfCheck: [],
        parentPeek: [], parentNote: '正解を教えてあげてください。',
      }],
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('banned-word'))).toBe(true);
  });
});

describe('redactToolNamesForKanjiFloor — the six AD-18 tool names are exempt as exact strings', () => {
  it('strips every one of the six locked tool-name labels out of a larger string', () => {
    const withNames =
      'A「ふたを あける」・B「まえの りゆうを 見る」・C「ふみ台を 見る」・' +
      'D「はみだしを さがす」・E「ひとつ けして かく」・F「むこうに すわる」';
    const redacted = redactToolNamesForKanjiFloor(withNames);
    expect(redacted).not.toContain('ふたを あける');
    expect(redacted).not.toContain('まえの りゆうを 見る');
    expect(redacted).not.toContain('ふみ台を 見る');
    expect(redacted).not.toContain('はみだしを さがす');
    expect(redacted).not.toContain('ひとつ けして かく');
    expect(redacted).not.toContain('むこうに すわる');
  });

  it('leaves surrounding text untouched — only the exact locked strings are removed', () => {
    const text = 'まえおき「ふたを あける」あとがき';
    expect(redactToolNamesForKanjiFloor(text)).toBe('まえおき「」あとがき');
  });

  it('does not touch a near-miss that is not an exact match (e.g. a different conjugation)', () => {
    const text = 'きょうは ふたを あけた';
    expect(redactToolNamesForKanjiFloor(text)).toBe(text);
  });

  it('a lesson whose teachBack.prompt quotes the locked tool names verbatim lints clean of kanji-floor for them', () => {
    const lesson = baseLesson({
      teachBack: { prompt: 'どうぐを ふたつ。「ふたを あける」と「まえの りゆうを 見る」。' },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    // "見る" inside the locked B-tool name is never flagged — nothing here should read it as
    // a kanji-floor violation (there is no floor entry for 見る in the first place, but this
    // guards the redaction path stays wired in rather than accidentally bypassed).
    expect(result.contentLintWarnings.some((w) => w.includes('[kanji-floor]'))).toBe(false);
  });
});

describe('checkCourseLesson — WO-C2 §5 new surfaces are scanned by the right lint (or exempt)', () => {
  it('a banned/PII word inside teachBack.cards[].help is caught (child-facing)', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      teachBack: {
        prompt: 'げんきに はなそう',
        cards: [{ tool: 'A', frame: 'わく', help: '住所を きいて みよう' }],
      },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('pii-word'))).toBe(true);
  });

  it('a banned/PII word inside family.choices[] is caught (child-facing)', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      family: { whoKnows: '', aiExample: '', applyTool: '', notes: [], choices: ['住所を きいて みよう'] },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('pii-word'))).toBe(true);
  });

  it('make[].parentNote/peekNote are lint-checked as parent-facing (banned/PII only, never length)', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      make: [{
        tool: 'A', methodCard: 'A', dialogue: [], starterCards: [], parentPrompts: [], selfCheck: [],
        parentPeek: [], parentNote: '住所を きいて みよう', peekNote: 'あ'.repeat(60),
      }],
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues.some((i) => i.includes('pii-word') && i.includes('parent-facing'))).toBe(true);
    expect(result.contentLintIssues.some((i) => i.includes('[length]'))).toBe(false);
  });

  it('factChecks/bDefinitionNote/version/listenReview.note are never scanned by any lint', () => {
    const lesson = baseLesson({
      review: { model: 'pass', philosophy: 'approved', japanese: 'approved' },
      factChecks: [{ where: 'x', claim: '住所を きいて みよう', status: 'confirmed' }],
      bDefinitionNote: '住所を きいて みよう',
      version: '住所を きいて みよう',
      listenReview: { model: 'pass', philosophy: 'approved', japanese: 'approved', note: '住所を きいて みよう' },
    });
    const result = checkCourseLesson(lesson, gradeOf, { strict: false });
    expect(result.contentLintIssues).toEqual([]);
  });
});
