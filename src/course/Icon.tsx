/**
 * WO-C1/AD-18: renders one of the six locked tool icons via the sprite's `<use href="#tool-X"/>`
 * pattern (src/course/assets/icons/README.md). The sprite itself is never inlined per-call — it's
 * mounted once (`<CourseIconSprite/>`, in the course shell's root) and every `<Icon/>` just
 * references it by id, the standard SVG-sprite technique for many small reused icons.
 */
import type { CourseToolId } from './content/types';

/** README.md's own table, verbatim — the one place object/label pairs are named, so every caller
 *  (card alt text, aria-label, the parent-facing method legend) reads from the same source instead
 *  of re-typing them. */
export const TOOL_LABELS: Record<CourseToolId, { object: string; label: string }> = {
  A: { object: 'おべんとうばこ', label: 'ふたを あける' },
  B: { object: 'ドミノ', label: 'まえの りゆうを 見る' },
  C: { object: 'ふみ台', label: 'ふみ台を 見る' },
  D: { object: 'かさ', label: 'はみだしを さがす' },
  E: { object: 'けしゴム', label: 'ひとつ けして かく' },
  F: { object: 'シーソー', label: 'むこうに すわる' },
};

/** README.md: "Accessible names: use the Japanese object name and label, e.g. 「おべんとうばこ
 *  （ふたを あける）」." */
export function toolAccessibleName(tool: CourseToolId): string {
  const { object, label } = TOOL_LABELS[tool];
  return `${object}（${label}）`;
}

/** Mounted once per page (course/main.tsx) — `<use>` references only work against a sprite that's
 *  actually present in the DOM (fetching the .svg as an <img> src would rasterize/isolate it and
 *  break `<use href="#tool-A">`), so this loads it as inline markup via Vite's `?raw` import. */
export { default as courseIconSpriteRaw } from './assets/icons/tool-icons.sprite.svg?raw';

export interface IconProps {
  tool: CourseToolId;
  /** README.md: "Sizes used in the designs: 96 px on cards, 32 px on buttons, 22–24 px inline.
   *  Don't go below 24 px." Not enforced here (a caller may legitimately need e.g. a 20px dense
   *  list some day) — documented so a regression doesn't silently drift under the floor. */
  size?: number;
  className?: string;
}

export function Icon({ tool, size = 32, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={toolAccessibleName(tool)}
    >
      <use href={`#tool-${tool}`} />
    </svg>
  );
}
