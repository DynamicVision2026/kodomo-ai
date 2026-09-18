import type { Stage } from './types';

/**
 * Local, per-device state. NO PII: preset avatar + preset nickname id + a stage number.
 * Never a grade, birthday, name, school or free text. Spec v0.5 §7.
 */
const KEY = 'm-app.v1'; // brand-neutral: the product name may still change

export interface Progress { done: boolean; stamps: number; coop: boolean }
export interface Profile {
  id: string;
  avatarId: string;
  nicknameId: string;
  stage: Stage;
  progress: Record<string, Progress>;
}
export interface AppState {
  profiles: Profile[];
  entitlements: string[];
  founder: boolean;
  abVariant: 'A' | 'B';
}

export const MAX_PROFILES = 6;

const empty = (): AppState => ({
  profiles: [],
  entitlements: ['m1:free'],
  founder: false,
  abVariant: Math.random() < 0.5 ? 'A' : 'B',
});

/** Always succeeds: storage may be blocked (private mode, school device). */
export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function save(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — the app must keep working for this session */
  }
}
