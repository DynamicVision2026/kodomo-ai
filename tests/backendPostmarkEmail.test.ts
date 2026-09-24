/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PostmarkEmailSender } from '../backend/server/postmarkEmail';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeFetch(status = 200): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn(async () => new Response(status === 200 ? '{}' : 'error', { status }));
}

describe('PostmarkEmailSender', () => {
  it('sends a bare From address when no display name is configured (unchanged from before)', async () => {
    const fetchMock = fakeFetch();
    vi.stubGlobal('fetch', fetchMock);
    const sender = new PostmarkEmailSender('token', 'no-reply@domo-ai.com');
    await sender.send({ to: 'parent@example.com', subject: 'S', text: 'T' });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init!.body as string);
    expect(body.From).toBe('no-reply@domo-ai.com');
    expect(body.ReplyTo).toBeUndefined();
  });

  it('formats From as "Name" <email> when a display name is configured', async () => {
    const fetchMock = fakeFetch();
    vi.stubGlobal('fetch', fetchMock);
    const sender = new PostmarkEmailSender('token', 'no-reply@domo-ai.com', 'ナゼホリ');
    await sender.send({ to: 'parent@example.com', subject: 'S', text: 'T' });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init!.body as string);
    expect(body.From).toBe('"ナゼホリ" <no-reply@domo-ai.com>');
  });

  it('includes ReplyTo only when configured', async () => {
    const fetchMock = fakeFetch();
    vi.stubGlobal('fetch', fetchMock);
    const sender = new PostmarkEmailSender('token', 'no-reply@domo-ai.com', 'ナゼホリ', 'info@domo-ai.com');
    await sender.send({ to: 'parent@example.com', subject: 'S', text: 'T' });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init!.body as string);
    expect(body.ReplyTo).toBe('info@domo-ai.com');
  });

  it('throws with the response body on a non-ok Postmark response', async () => {
    vi.stubGlobal('fetch', fakeFetch(422));
    const sender = new PostmarkEmailSender('token', 'no-reply@domo-ai.com');
    await expect(sender.send({ to: 'parent@example.com', subject: 'S', text: 'T' })).rejects.toThrow(/422/);
  });
});
