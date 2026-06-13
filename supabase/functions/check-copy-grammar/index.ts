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
  // 'error' = definite mistake that should HALT the launch (clear typo / broken
  // grammar). 'suggestion' = preferential/ambiguous tweak that should NOT block.
  severity?: 'error' | 'suggestion';
  // Corrected token for one-click replace (spelling errors).
  suggestion?: string;
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

Flag two things, each with a SEVERITY:
- "spelling": a misspelled word.
- "grammar": a grammatical mistake (wrong verb agreement, your/you're, its/it's, missing word that breaks the sentence, duplicated word).

SEVERITY — this is the most important judgment:
- "error" = a DEFINITE mistake that must halt the launch: an unambiguous typo ("recieve", "Sumer"→"Summer", "teh"), or broken grammar. There is one clearly-correct fix.
- "suggestion" = a preferential or ambiguous tweak that should NOT block launch: accepted modern spellings or compound variants ("ebook"/"e-book", "hydrated", "ecommerce"), British/American differences, or anything where reasonable people differ. When you are not fully certain it is wrong, mark it "suggestion", never "error".

For "spelling", ALWAYS include "suggestion": the single best corrected spelling of the token (for one-click replace). For "grammar", "suggestion" may be omitted.

NEVER flag:
- Style, tone, punctuation taste, capitalization choices, emoji, or copywriting quality.
- Sentence fragments, ellipses, ALL-CAPS words, exclamation marks — normal in email marketing.
- Brand names, product names, promo codes, URLs, or any word in the custom dictionary (always correct, including possessive/plural forms).

NEVER rewrite the whole line or invent alternative copy. Only identify the broken token, classify severity, and give the corrected token.

Custom dictionary (always valid): ${dictWords.length > 0 ? dictWords.join(', ') : '(none)'}

You will receive a JSON array of texts. Return ONLY a JSON array of the same length, where element i is the issue list for texts[i]:
[[{"kind":"spelling"|"grammar","token":"<exact word(s) from the text>","severity":"error"|"suggestion","suggestion":"<corrected token>","message":"<short objective explanation>"}], ...]
Use [] for texts with no issues.`;

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
          severity: iss.severity === 'suggestion' ? 'suggestion' : 'error',
          suggestion: typeof iss.suggestion === 'string' ? iss.suggestion.slice(0, 80) : '',
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
