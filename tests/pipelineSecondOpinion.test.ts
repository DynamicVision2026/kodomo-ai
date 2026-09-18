import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { activeProvider, callSecondOpinionJson, MissingSecondOpinionKeyError, PROVIDERS } from '../pipeline/lib/secondOpinion';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('activeProvider', () => {
  it('defaults to deepseek when CROSSCHECK_PROVIDER is unset (founder decision, moved off gpt-4o)', () => {
    delete process.env.CROSSCHECK_PROVIDER;
    expect(activeProvider()).toBe(PROVIDERS.deepseek);
  });

  it('can be switched back to openai via CROSSCHECK_PROVIDER', () => {
    process.env.CROSSCHECK_PROVIDER = 'openai';
    expect(activeProvider()).toBe(PROVIDERS.openai);
  });

  it('throws on an unknown provider name rather than silently falling back', () => {
    process.env.CROSSCHECK_PROVIDER = 'gemini';
    expect(() => activeProvider()).toThrow(/Unknown CROSSCHECK_PROVIDER "gemini"/);
  });
});

describe('callSecondOpinionJson', () => {
  it('names the active provider\'s own API key env var when it is missing', async () => {
    delete process.env.CROSSCHECK_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await expect(callSecondOpinionJson('sys', 'user', { requiredBy: '02_crosscheck' })).rejects.toThrow(
      MissingSecondOpinionKeyError,
    );
    await expect(callSecondOpinionJson('sys', 'user', { requiredBy: '02_crosscheck' })).rejects.toThrow(
      /requires DEEPSEEK_API_KEY/,
    );
  });

  it('posts to DeepSeek\'s endpoint with its default model when deepseek is active', async () => {
    process.env.CROSSCHECK_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"verdict":"supported"}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callSecondOpinionJson('sys', 'user', { requiredBy: '02_crosscheck' });
    expect(result).toEqual({ verdict: 'supported' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('deepseek-chat');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('posts to OpenAI\'s endpoint when explicitly switched back', async () => {
    process.env.CROSSCHECK_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"verdict":"weak"}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callSecondOpinionJson('sys', 'user', { requiredBy: '05_entail' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.parse(init.body).model).toBe('gpt-4o');
  });

  it('surfaces a non-ok response as an error naming the provider', async () => {
    process.env.CROSSCHECK_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }));

    await expect(callSecondOpinionJson('sys', 'user', { requiredBy: 'tag_audit' })).rejects.toThrow(
      /deepseek API error 500/,
    );
  });
});
