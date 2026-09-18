import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePicker } from '../src/shell/ProfilePicker';
import type { Profile } from '../src/engine/storage';
import { MAX_PROFILES } from '../src/engine/storage';

afterEach(() => cleanup());

const ui = {
  profilePickTitle: 'だれが あそぶ？',
  profileCreateLabel: 'あたらしく つくる',
  profileMaxReached: 'もう いっぱいだよ',
  profileConfirm: 'これにする',
};

function makeProfile(i: number): Profile {
  return { id: `p${i}`, avatarId: 'a1', nicknameId: 'n1', stage: 2, progress: {} };
}

describe('ProfilePicker', () => {
  it('lists existing profiles and calls onSelect with the chosen one', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const profile = makeProfile(1);
    render(<ProfilePicker profiles={[profile]} ui={ui} defaultStage={2} onSelect={onSelect} onCreate={() => {}} />);

    expect(screen.getByText('たぬき')).toBeInTheDocument();
    await user.click(screen.getByText('たぬき'));
    expect(onSelect).toHaveBeenCalledWith(profile);
  });

  it('creating a profile requires both an avatar and a nickname, then calls onCreate', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ProfilePicker profiles={[]} ui={ui} defaultStage={2} onSelect={() => {}} onCreate={onCreate} />);

    await user.click(screen.getByText(ui.profileCreateLabel));
    expect(screen.getByText(ui.profileConfirm)).toBeDisabled();

    await user.click(screen.getByText('🦊'));
    expect(screen.getByText(ui.profileConfirm)).toBeDisabled(); // nickname still missing

    await user.click(screen.getByText('うさぎ'));
    expect(screen.getByText(ui.profileConfirm)).toBeEnabled();

    await user.click(screen.getByText(ui.profileConfirm));
    expect(onCreate).toHaveBeenCalledTimes(1);
    const created = onCreate.mock.calls[0]![0] as Profile;
    expect(created.avatarId).toBe('a1'); // 🦊
    expect(created.nicknameId).toBe('n2'); // うさぎ
    expect(created.stage).toBe(2);
    expect(created.progress).toEqual({});
  });

  it('offers "create" under the profile cap, and the max-reached message at the cap', () => {
    const under = Array.from({ length: MAX_PROFILES - 1 }, (_, i) => makeProfile(i));
    const { rerender } = render(<ProfilePicker profiles={under} ui={ui} defaultStage={2} onSelect={() => {}} onCreate={() => {}} />);
    expect(screen.getByText(ui.profileCreateLabel)).toBeInTheDocument();

    const atCap = Array.from({ length: MAX_PROFILES }, (_, i) => makeProfile(i));
    rerender(<ProfilePicker profiles={atCap} ui={ui} defaultStage={2} onSelect={() => {}} onCreate={() => {}} />);
    expect(screen.queryByText(ui.profileCreateLabel)).not.toBeInTheDocument();
    expect(screen.getByText(ui.profileMaxReached)).toBeInTheDocument();
  });

  it('creates a profile at defaultStage, not a hardcoded literal (Sprint 1-A §2.2)', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ProfilePicker profiles={[]} ui={ui} defaultStage={3} onSelect={() => {}} onCreate={onCreate} />);

    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('うさぎ'));
    await user.click(screen.getByText(ui.profileConfirm));

    const created = onCreate.mock.calls[0]![0] as Profile;
    expect(created.stage).toBe(3);
  });
});
