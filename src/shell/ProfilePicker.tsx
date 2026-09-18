import { useState } from 'react';
import type { Profile } from '../engine/storage';
import { MAX_PROFILES } from '../engine/storage';
import type { Stage } from '../engine/types';
import presets from './presets.json';
import './profile-picker.css';

/**
 * Emoji stand-ins for the real mascot art (Task 0.5, founder-owned, not delivered yet).
 * Swap presets.json's avatars for real asset ids/paths once that art exists — nothing else
 * in this component depends on the representation being an emoji.
 */
export interface ProfilePickerUi {
  profilePickTitle: string;
  profileCreateLabel: string;
  profileMaxReached: string;
  profileConfirm: string;
}

export interface ProfilePickerProps {
  profiles: Profile[];
  ui: ProfilePickerUi;
  /** Stage a newly-created profile starts at. Spec v0.5 §5 step 0: "stage (default 2)" — this
   *  is always a default, never a per-family choice at creation time (docs/work-order-w2 §2.2):
   *  the mission library picks stage-appropriate content for whatever stage a profile ends up
   *  at, so profile creation itself stays stage-blind. */
  defaultStage: Stage;
  onSelect: (profile: Profile) => void;
  onCreate: (profile: Profile) => void;
}

function emojiFor(avatarId: string): string {
  return presets.avatars.find((a) => a.id === avatarId)?.emoji ?? '❔';
}
function labelFor(nicknameId: string): string {
  return presets.nicknames.find((n) => n.id === nicknameId)?.label ?? '';
}

function newProfileId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Preset avatar + preset nickname + a stage number — never a name, birthday, school, or free
 * text. Spec v0.5 §7, §5 step 0. Max 6 profiles (storage.MAX_PROFILES). `defaultStage` is a
 * default, not a choice offered here — see ProfilePickerProps.defaultStage.
 */
export function ProfilePicker({ profiles, ui, defaultStage, onSelect, onCreate }: ProfilePickerProps) {
  const [creating, setCreating] = useState(false);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [nicknameId, setNicknameId] = useState<string | null>(null);

  if (creating) {
    const confirm = () => {
      if (!avatarId || !nicknameId) return;
      onCreate({ id: newProfileId(), avatarId, nicknameId, stage: defaultStage, progress: {} });
    };

    return (
      <div className="profile-picker">
        <p className="profile-picker__title">{ui.profilePickTitle}</p>
        <div className="profile-picker__grid">
          {presets.avatars.map((a) => (
            <button
              key={a.id}
              type="button"
              className="profile-picker__choice"
              aria-pressed={avatarId === a.id}
              onClick={() => setAvatarId(a.id)}
            >
              {a.emoji}
            </button>
          ))}
        </div>
        <div className="profile-picker__grid">
          {presets.nicknames.map((n) => (
            <button
              key={n.id}
              type="button"
              className="profile-picker__choice"
              aria-pressed={nicknameId === n.id}
              onClick={() => setNicknameId(n.id)}
            >
              {n.label}
            </button>
          ))}
        </div>
        <button type="button" className="profile-picker__confirm" onClick={confirm} disabled={!avatarId || !nicknameId}>
          {ui.profileConfirm}
        </button>
      </div>
    );
  }

  return (
    <div className="profile-picker">
      <p className="profile-picker__title">{ui.profilePickTitle}</p>
      <div className="profile-picker__grid">
        {profiles.map((p) => (
          <button key={p.id} type="button" className="profile-picker__profile" onClick={() => onSelect(p)}>
            <span className="profile-picker__avatar">{emojiFor(p.avatarId)}</span>
            <span className="profile-picker__nickname">{labelFor(p.nicknameId)}</span>
          </button>
        ))}
      </div>
      {profiles.length < MAX_PROFILES ? (
        <button type="button" className="profile-picker__create" onClick={() => setCreating(true)}>
          {ui.profileCreateLabel}
        </button>
      ) : (
        <p className="profile-picker__max">{ui.profileMaxReached}</p>
      )}
    </div>
  );
}
