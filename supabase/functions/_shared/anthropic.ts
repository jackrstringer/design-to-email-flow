// Shared Anthropic API helper for agent functions.
// Model ids are configurable via env so upgrades don't require code changes.

export const AGENT_MODEL = Deno.env.get('AGENT_MODEL') ?? 'claude-sonnet-4-5';
export const AGENT_MODEL_FAST = Deno.env.get('AGENT_MODEL_FAST') ?? 'claude-haiku-4-5-20251001';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: unknown;
}

export async function callClaude(params: {
  model?: string;
  system?: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model ?? AGENT_MODEL,
      max_tokens: params.maxTokens ?? 4000,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      ...(params.system ? { system: params.system } : {}),
      messages: params.messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = await response.json();
  const block = data.content?.find((b: { type: string }) => b.type === 'text');
  return block?.text ?? '';
}

/** Extracts the first JSON object/array from a model response. */
export function parseModelJson<T>(text: string): T {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = Math.min(
    ...['{', '['].map((c) => {
      const i = cleaned.indexOf(c);
      return i === -1 ? Infinity : i;
    }),
  );
  if (start === Infinity) throw new Error('No JSON found in model response');
  return JSON.parse(cleaned.slice(start)) as T;
}
