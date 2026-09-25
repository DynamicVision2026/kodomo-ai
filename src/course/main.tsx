// Formal course entry (/course) — WO-C1. Deliberately its own root, not routed through
// src/main.tsx/MissionShell (Coordinator: "build a separate course shell with its own entry and
// route"). Mounts the locked AD-18 icon sprite once (Icon.tsx's own `<use href="#tool-A">`
// pattern needs it present in the DOM) alongside the course app tree.
import { createRoot } from 'react-dom/client';
import { CourseApp } from './CourseApp';
import { courseIconSpriteRaw } from './Icon';

function CourseIconSprite() {
  return <div dangerouslySetInnerHTML={{ __html: courseIconSpriteRaw }} />;
}

createRoot(document.getElementById('root')!).render(
  <>
    <CourseIconSprite />
    <CourseApp />
  </>,
);
