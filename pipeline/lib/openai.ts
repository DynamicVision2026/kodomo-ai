/**
 * Shared OpenAI call used by every pipeline step that needs a DIFFERENT provider from Claude
 * (spec v0.5 §6: "a model checking itself is not a check") — 02_crosscheck, 05_entail,
 * tag_audit. Raw fetch, not the OpenAI SDK: one JSON-mode chat call is not worth a dependency.
 */
export const DEFAULT_MODEL = 'gpt-4o';

export class MissingOpenAiKeyError extends Error {}

/** Calls OpenAI chat completions in JSON mode and returns the parsed response body. */
export async function callOpenAiJson(
  systemPrompt: string,
  userPrompt: string,
  opts: { model?: string; requiredBy: string } ,
): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new MissingOpenAiKeyError(
      `${opts.requiredBy} requires OPENAI_API_KEY (it must use a different provider from ` +
      "Claude — a model checking itself is not a check). Set it in this environment and re-run.",
    );
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = body.choices[0]?.message.content;
  if (!content) throw new Error('OpenAI response had no content.');

  return JSON.parse(content);
}
