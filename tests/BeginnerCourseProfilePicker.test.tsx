/**
 * Launch-blocker regression test (4 Oct 2026): a brand-new family (one profile) tapping
 * 「+ ふやす」 on `BeginnerCourseApp`'s own profile-picker screen used to hit a dead, `aria-hidden`
 * div with no click handler at all — see `BeginnerCourseApp.tsx`'s own doc comment on that screen
 * for the root cause. These tests exercise the real component (not just the underlying
 * `createProfile` API, already covered by `src/shell/ProfilePicker.tsx`'s own tests) so a future
 * regression on THIS screen is caught here too.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeResponse } from '../src/course/api';

const { fetchMe, createProfile, apiFetch, isFailure } = vi.hoisted(() => ({
  fetchMe: vi.fn<() => Promise<MeResponse>>(),
  createProfile: vi.fn(),
  apiFetch: vi.fn(async () => ({ ok: false, reason: 'not_configured' })),
  isFailure: (res: unknown): res is { ok: false; reason: string } => !!res && typeof res === 'object' && 'reason' in res,
}));

vi.mock('../src/family/api', () => ({
  fetchMe,
  createProfile,
  apiFetch,
  isFailure,
  isFamilyApiConfigured: () => false,
}));

import { BeginnerCourseApp } from '../src/course/BeginnerCourseApp';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function baseMe(profiles: MeResponse['profiles']): MeResponse {
  return {
    familyId: 'f1',
    email: 'parent@example.com',
    entitlements: [],
    profiles,
    trials: [],
    courseAllowed: true,
    consentRecorded: true,
  };
}

describe('BeginnerCourseApp profile picker — 「+ ふやす」 (launch blocker)', () => {
  it('a brand-new family (one profile) can tap 「+ ふやす」 and create a second profile', async () => {
    const user = userEvent.setup();
    fetchMe.mockResolvedValue(baseMe([{ id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 }]));
    createProfile.mockResolvedValue({ id: 'p2' });

    render(<BeginnerCourseApp />);
    await screen.findByText('たぬき'); // existing profile tile rendered

    const addTile = screen.getByText('ふやす').closest('button');
    expect(addTile).not.toBeNull();
    expect(addTile).not.toHaveAttribute('aria-hidden', 'true'); // the regression: used to be an inert div
    await user.click(addTile!);

    // avatar + nickname chooser now visible
    await user.click(screen.getByText('🐰'));
    await user.click(screen.getByText('きつね'));

    const confirm = screen.getByText('これにする');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(createProfile).toHaveBeenCalledWith('a2', 'n3', 2));
  });

  it('shows an error and never silently discards the pick when creation fails', async () => {
    const user = userEvent.setup();
    fetchMe.mockResolvedValue(baseMe([{ id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 }]));
    createProfile.mockResolvedValue({ ok: false, reason: 'network' });

    render(<BeginnerCourseApp />);
    await screen.findByText('たぬき');

    await user.click(screen.getByText('ふやす').closest('button')!);
    await user.click(screen.getByText('🐰'));
    await user.click(screen.getByText('きつね'));
    await user.click(screen.getByText('これにする'));

    await screen.findByText('うまく つくれませんでした。もう一度 ためしてね。');
    // the picker stays open with the family's choices still selected, not reset to a dead end
    expect(screen.getByText('これにする')).toBeEnabled();
  });

  it('hides 「+ ふやす」 once the family is already at the 3-profile cap', async () => {
    fetchMe.mockResolvedValue(
      baseMe([
        { id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 },
        { id: 'p2', avatarId: 'a2', nicknameId: 'n2', stage: 2 },
        { id: 'p3', avatarId: 'a3', nicknameId: 'n3', stage: 2 },
      ]),
    );

    render(<BeginnerCourseApp />);
    await screen.findByText('たぬき');
    expect(screen.queryByText('ふやす')).not.toBeInTheDocument();
  });
});
