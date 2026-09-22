// AD-12 (ひらく＋ 整えたかたち, B+ refined) — Pass 1 static component library. Barrel export so
// a future integration ticket (wiring these into the live MissionStage/CourseHome/BankSelect/
// CompletionRitual screens) has one import surface, same convention as src/stage's own files.
export { Plane } from './Plane';
export { FieldStage, type FieldTone } from './FieldStage';
export { GuidanceAffordance } from './GuidanceAffordance';
export { AnswerPlane } from './AnswerPlane';
export { JudgeBar } from './JudgeBar';
export { SlipCascade, type Slip } from './SlipCascade';
export { MoveCard, type MoveCardVariant } from './MoveCard';
export { MoveTray, type TrayCard } from './MoveTray';
export { VoicePlane, type Speaker } from './VoicePlane';
export { RefrainSlot } from './RefrainSlot';
export { DepthRow } from './DepthRow';
export { RootPlane } from './RootPlane';
export { rootFormFor, type RootForm } from './rootForm';
export { TeachBackPanel } from './TeachBackPanel';
export { HomePlane } from './HomePlane';
export { BankPlane, type BankItem } from './BankPlane';
export { BreakthroughScene } from './BreakthroughScene';
export { prefersReducedMotion, animate, captureRect, playFlip, tokenMs, type AnimateOptions } from './motion';
