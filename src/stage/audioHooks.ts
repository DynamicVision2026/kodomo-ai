/**
 * WO-24 (AD-07 §14): the five semantic SFX hooks. No final licensed audio assets exist in this
 * repository yet (this prototype does not download or bundle any) — every path below 404s
 * against a real build today. `play()` is wrapped so that failure is silent: the interaction
 * must work identically with or without sound. Report this as a non-blocking asset gap, not a
 * defect — swap in real files at these exact paths later and every call site here starts
 * playing them with no further code change.
 */
export type StageSfxName = 'deepen' | 'stone' | 'rootChime' | 'bubblePop' | 'handoffChime';

const SFX_PATHS: Record<StageSfxName, string> = {
  deepen: '/audio/stage/deepen.mp3',       // ザクッ
  stone: '/audio/stage/stone.mp3',         // コツン
  rootChime: '/audio/stage/root-chime.mp3',
  bubblePop: '/audio/stage/bubble-pop.mp3',
  handoffChime: '/audio/stage/handoff-chime.mp3',
};

function playSfx(name: StageSfxName): void {
  try {
    if (typeof Audio === 'undefined') return; // no-op under jsdom/SSR
    const audio = new Audio(SFX_PATHS[name]);
    audio.play()?.catch(() => {}); // missing asset / autoplay policy — never surfaced to the child
  } catch {
    // Audio is decoration, never a dependency of the interaction itself.
  }
}

export function useStageSfx() {
  return {
    playDeepen: () => playSfx('deepen'),
    playStone: () => playSfx('stone'),
    playRootChime: () => playSfx('rootChime'),
    playBubblePop: () => playSfx('bubblePop'),
    playHandoffChime: () => playSfx('handoffChime'),
  };
}
