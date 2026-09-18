/**
 * Shared call used by every pipeline step that needs a model from a DIFFERENT provider than
 * Claude (spec v0.5 §6: "a model checking itself is not a check") — 02_crosscheck, 05_entail,
 * tag_audit. Raw fetch, not a provider SDK: one JSON-mode chat call per provider is not worth
 * a dependency, and every provider listed here speaks the same OpenAI-compatible wire format.
 *
 * Provider is configurable, not hardcoded to any one vendor — set CROSSCHECK_PROVIDER to
 * switch. Default is 'deepseek' (founder decision, moving off gpt-4o); 'openai' remains
 * available for anyone who wants it back.
 */
export interface SecondOpinionProvider {
  name: string;
  apiKeyEnv: string;
  baseUrl: string;
  defaultModel: string;
}

export const PROVIDERS: Record<string, SecondOpinionProvider> = {
  deepseek: {
    name: 'deepseek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
  },
  openai: {
    name: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
  },
};

const DEFAULT_PROVIDER = 'deepseek';

/** Which provider today's pipeline run uses for the "different from Claude" role. */
export function activeProvider(): SecondOpinionProvider {
  const name = process.env.CROSSCHECK_PROVIDER ?? DEFAULT_PROVIDER;
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown CROSSCHECK_PROVIDER "${name}". Known providers: ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  return provider;
}

export class MissingSecondOpinionKeyError extends Error {}

/** Calls the active second-opinion provider's chat completions in JSON mode and returns the
 *  parsed response body. */
export async function callSecondOpinionJson(
  systemPrompt: string,
  userPrompt: string,
  opts: { model?: string; requiredBy: string },
): Promise<unknown> {
  const provider = activeProvider();
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new MissingSecondOpinionKeyError(
      `${opts.requiredBy} requires ${provider.apiKeyEnv} (it must use a different provider from ` +
      `Claude — a model checking itself is not a check). Set it in this environment and re-run, ` +
      'or set CROSSCHECK_PROVIDER to switch providers.',
    );
  }

  const res = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? provider.defaultModel,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`${provider.name} API error ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = body.choices[0]?.message.content;
  if (!content) throw new Error(`${provider.name} response had no content.`);

  return JSON.parse(content);
}
