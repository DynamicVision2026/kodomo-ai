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
/** WO-C6 Push B: lesson-hub step badges (き/れ/チ/お) + the locked garden's own lock mark. */
export { default as courseUiIconSpriteRaw } from './assets/icons/course-ui-icons.sprite.svg?raw';
/** WO-C6 Push B: the garden's own growth-stage symbols (たね/め/つぼみ/はな) — see AD-19 stage math
 *  in progress.ts's `flowerStageForPercent`, which this purely-visual symbol replaces the text
 *  label for. */
export { default as gardenPlantSpriteRaw } from './assets/icons/garden-plant.sprite.svg?raw';

/** `flowerStageForPercent`'s own 4 stage ids, in growth order — the one place that string is
 *  mapped to which `<symbol id="p-...">` to draw. */
export function plantSymbolIdForStage(stage: 'seed' | 'sprout' | 'bud' | 'flower'): string {
  return `p-${stage}`;
}

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
