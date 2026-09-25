/**
 * WO-C1/AD-18: renders one of the six locked tool icons via the sprite's `<use href="#tool-X"/>`
 * pattern (src/course/assets/icons/README.md). The sprite itself is never inlined per-call — it's
 * mounted once (`<CourseIconSprite/>`, in the course shell's root) and every `<Icon/>` just
 * references it by id, the standard SVG-sprite technique for many small reused icons.
 */
import { courseUi } from './content/courseManifest';
import type { CourseToolId } from './content/types';

/** README.md's own accessible-name convention — object name + label. Reads from `courseUi.json`
 *  (spec v0.5 §7 / gate:no-hardcoded-copy), never a literal here. */
export function toolAccessibleName(tool: CourseToolId): string {
  const { object, label } = courseUi.toolLabels[tool];
  return `${object}（${label}）`;
}

/** Mounted once per page (course/main.tsx) — `<use>` references only work against a sprite that's
 *  actually present in the DOM (fetching the .svg as an <img> src would rasterize/isolate it and
 *  break `<use href="#tool-A">`), so this loads it as inline markup via Vite's `?raw` import. */
export { default as courseIconSpriteRaw } from './assets/icons/tool-icons.sprite.svg?raw';

export interface IconProps {
  tool: CourseToolId;
  /** README.md's own size floor: 96px on cards, 32px on buttons, 22-24px inline, never below
   *  24px. Not enforced here (a caller may legitimately need a denser list some day) — documented
   *  so a regression doesn't silently drift under the floor. */
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
