import presets from './presets.json' with { type: 'json' };

const AVATAR_IDS = new Set(presets.avatars.map((a) => a.id));
const NICKNAME_IDS = new Set(presets.nicknames.map((n) => n.id));

export function isValidAvatarId(id: string): boolean {
  return AVATAR_IDS.has(id);
}

export function isValidNicknameId(id: string): boolean {
  return NICKNAME_IDS.has(id);
}
