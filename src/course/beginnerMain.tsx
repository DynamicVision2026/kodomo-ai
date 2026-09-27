// WO-C5: 入門コース's own entry (/course/beginner) — deliberately separate from `course/main.tsx`
// (stage2), same "own entry, own route" discipline. Mounts the same icon sprite (the beginner
// lessons' tool icons, including the new `tool-G`, live in the exact same sprite file).
import { createRoot } from 'react-dom/client';
import { BeginnerCourseApp } from './BeginnerCourseApp';
import { courseIconSpriteRaw } from './Icon';

function CourseIconSprite() {
  return <div dangerouslySetInnerHTML={{ __html: courseIconSpriteRaw }} />;
}

createRoot(document.getElementById('root')!).render(
  <>
    <CourseIconSprite />
    <BeginnerCourseApp />
  </>,
);
