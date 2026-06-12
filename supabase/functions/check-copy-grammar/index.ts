// check-copy-grammar — LLM depth pass for subject-line / preview-text QA.
//
// The frontend runs an instant local Hunspell check; this function adds a
// reliable second opinion for things a dictionary can't see (real grammar
// mistakes, homophone slips) and confirms misspellings. It flags ONLY
// objective errors — never style, tone, or copy suggestions, and it never
// rewrites the text.
//
// Input:  { texts: string[], dictionary: string[] }
// Output: { results: [{ issues: [{ kind: 'spelling'|'grammar', token, message }] }] }
//         (results[i] corresponds to texts[i])

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, serviceClient, AuthError } from "../_shared/auth.ts";
import { newTrace, logEvent, sanitizeError } from "../_shared/log.ts";
import { enforceRateLimit, RateLimitError } from "../_shared/ratelimit.ts";
import { callClaude, parseModelJson, AGENT_MODEL_FAST } from "../_shared/anthropic.ts";

interface CopyIssue {
  kind: 'spelling' | 'grammar';
  token: string;
  message: string;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const ctx = newTrace('check-copy-grammar', req);

  try {
    const auth = await requireAuth(req);
    const { texts, dictionary } = await req.json();

    if (!Array.isArray(texts) || texts.length === 0 || texts.some((t) => typeof t !== 'string')) {
      return jsonResponse(req, { error: 'texts must be a non-empty string array' }, 400);
    }
    if (texts.length > 20) {
      return jsonResponse(req, { error: 'Max 20 texts per request' }, 400);
    }
    const dictWords: string[] = Array.isArray(dictionary)
      ? dictionary.filter((w: unknown) => typeof w === 'string').slice(0, 500)
      : [];

    // Rate limit per user (these are short, frequent checks).
    const supabase = serviceClient();
    await enforceRateLimit(supabase, auth.userId ?? 'service', 'check-copy-grammar', 60, 60);

    const system = `You are a strict spelling and grammar checker for short marketing email subject lines and preview texts.

Flag ONLY objective errors:
- "spelling": a genuinely misspelled word (e.g. "recieve", "Sumer" for "Summer").
- "grammar": a clear grammatical mistake (wrong verb agreement, your/you're, its/it's, missing word that breaks the sentence, duplicated word).

NEVER flag:
- Style, tone, punctuation taste, capitalization choices, emoji, or copywriting quality.
- Sentence fragments, ellipses, ALL-CAPS words, exclamation marks — normal in email marketing.
- Brand names, product names, promo codes, URLs, or any word in the custom dictionary (these are always correct, including possessive/plural forms).
- Anything you are not certain is wrong. When in doubt, do not flag.

NEVER rewrite or suggest alternative copy. Only identify the broken token and explain the error in one short sentence.

Custom dictionary (always valid): ${dictWords.length > 0 ? dictWords.join(', ') : '(none)'}

You will receive a JSON array of texts. Return ONLY a JSON array of the same length, where element i is the issue list for texts[i]:
[[{"kind":"spelling"|"grammar","token":"<exact word(s) from the text>","message":"<short objective explanation>"}], ...]
Use [] for texts with no errors.`;

    const responseText = await callClaude({
      model: AGENT_MODEL_FAST,
      system,
      messages: [{ role: 'user', content: JSON.stringify(texts) }],
      maxTokens: 1500,
      temperature: 0,
    });

    let parsed: CopyIssue[][];
    try {
      parsed = parseModelJson<CopyIssue[][]>(responseText);
    } catch {
      logEvent(ctx, 'warn', 'unparseable_model_response', { sample: responseText.slice(0, 200) });
      parsed = [];
    }

    const dictLower = new Set(dictWords.map((w) => w.toLowerCase()));
    const results = texts.map((text: string, i: number) => {
      const raw = Array.isArray(parsed[i]) ? parsed[i] : [];
      const issues = raw
        .filter((iss) =>
          iss && typeof iss.token === 'string' && iss.token.length > 0 &&
          (iss.kind === 'spelling' || iss.kind === 'grammar') &&
          // Hard server-side guards: the token must actually appear in the
          // text, and dictionary words can never be flagged.
          text.toLowerCase().includes(iss.token.toLowerCase()) &&
          !dictLower.has(iss.token.toLowerCase().replace(/['’]s$/, '')),
        )
        .map((iss) => ({
          kind: iss.kind,
          token: iss.token,
          message: typeof iss.message === 'string' ? iss.message.slice(0, 200) : '',
        }));
      return { issues };
    });

    logEvent(ctx, 'info', 'grammar_check_complete', {
      texts: texts.length,
      flagged: results.reduce((n, r) => n + r.issues.length, 0),
    });

    return jsonResponse(req, { results });
  } catch (error: unknown) {
    if (error instanceof AuthError) return jsonResponse(req, { error: error.message }, error.status);
    if (error instanceof RateLimitError) return jsonResponse(req, { error: error.message }, 429);
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
