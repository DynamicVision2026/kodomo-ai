// Audio Reference Slice (AD-10 / Audio Reference Scripts rev.3). Engine-side data shape only —
// never imported by module.json or any content-lint pipeline (see src/audio/registry.ts's own
// doc comment for why this whole directory sits outside src/modules).

/** The three frozen reference patterns rev.3 defines. MODEL and GUIDED play BEFORE practice;
 *  CHECKPOINT plays AFTER the child's own work, teach-back and the M2b parent confirmation. */
export type AudioRole = 'MODEL' | 'GUIDED' | 'CHECKPOINT';

export interface AudioScript {
  /** The Mission this script belongs to — src/audio/registry.ts's own lookup key. */
  missionId: string;
  role: AudioRole;
  /**
   * rev.3's own anchor requirement: "every ROBOT line must be the authored robotSays text, word
   * for word... If the audio and the stage differ by even one word, that anchor breaks." This is
   * that mission's dig phase's own layer-0 `robotSays`, copied verbatim from its s2.json — never
   * new copy authored here. tests/Audio.test.tsx asserts this field still matches each mission's
   * real content, so drift is caught before it ever reaches a recording session.
   */
  robotLine: string;
  /**
   * MODEL only (rev.3 §E, "One engine dependency to flag"): the dig layer indices (0-based) this
   * script demonstrates in full before the child ever plays them. A play at one of these layers
   * is primed — the child has just heard the answer — so src/stage/MissionStage.tsx suppresses
   * its `onUse` evidence entirely (no `use`, no `apt_use`, no rung advancement, no milestone
   * credit) for exactly these layers; every other layer records exactly as it always has.
   * Deliberately carried on the script itself, never as a standalone field anywhere else, so the
   * guard can never be enabled independently of the audio that justifies it — src/shell/
   * MissionShell.tsx only ever reads it off the mission's own registered AudioScript.
   */
  demonstratedLayers?: number[];
}
