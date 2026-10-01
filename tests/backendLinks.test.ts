/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { loginUrl, activationLoginUrl } from '../backend/src/links';
import type { Env } from '../backend/src/types';

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return { APP_BASE_URL: 'https://domo-ai.com', ...overrides } as Env;
}

describe('backend/src/links.ts', () => {
  it('loginUrl with no options returns the bare, trailing-slash login path', () => {
    expect(loginUrl(fakeEnv())).toBe('https://domo-ai.com/login/');
  });

  it('loginUrl encodes email/next as query params when given', () => {
    const url = loginUrl(fakeEnv(), { email: 'parent@example.com', next: '/course/beginner/' });
    expect(url).toBe('https://domo-ai.com/login/?email=parent%40example.com&next=%2Fcourse%2Fbeginner%2F');
  });

  it('activationLoginUrl (email-redesign, item 6): enriched with email + next only once BEGINNER_LAUNCH is on', () => {
    const before = activationLoginUrl(fakeEnv({ BEGINNER_LAUNCH: undefined }), 'parent@example.com');
    expect(before).toBe('https://domo-ai.com/login/');

    const after = activationLoginUrl(fakeEnv({ BEGINNER_LAUNCH: '1' }), 'parent@example.com');
    expect(after).toBe('https://domo-ai.com/login/?email=parent%40example.com&next=%2Fcourse%2Fbeginner%2F');
  });
});
