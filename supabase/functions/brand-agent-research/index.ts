// brand-agent-research — autonomous brand research.
//
// Mines the brand's own Klaviyo history (the last ~20 sent email campaigns:
// names, subject lines, preview texts) and distills it into durable
// brand_knowledge: voice patterns, subject-line conventions, promo cadence.
// When something important can't be inferred, it files a 'question' entry —
// surfaced in the Knowledge tab for the user to answer.
//
// Triggered manually from the Knowledge tab, automatically by
// brand-agent-refresh when a brand has a Klaviyo key but no voice knowledge.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, requireBrandAccess, serviceClient, AuthError } from "../_shared/auth.ts";
import { getBrandSecret } from "../_shared/secrets.ts";
import { newTrace, logEvent, sanitizeError } from "../_shared/log.ts";
import { enforceRateLimit, RateLimitError } from "../_shared/ratelimit.ts";
import { callClaude, parseModelJson, AGENT_MODEL } from "../_shared/anthropic.ts";
import { KLAVIYO_REVISION } from "../_shared/klaviyo.ts";

interface ResearchEntry {
  kind: 'voice' | 'style' | 'product' | 'promo' | 'link_rule' | 'fact' | 'question';
  title: string;
  content: string;
  confidence: number;
  /** REQUIRED for 'question' kind: 3-5 plausible, mutually distinct answers
   *  the user can pick with one click. The UI falls back to free text when
   *  absent (legacy questions). */
  answer_options?: string[];
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const ctx = newTrace('brand-agent-research', req);

  try {
    const auth = await requireAuth(req);
    const { brandId, trigger = 'manual' } = await req.json();
    if (!brandId) return jsonResponse(req, { error: 'brandId is required' }, 400);

    const supabase = serviceClient();
    const brand = await requireBrandAccess(
      supabase, brandId, auth,
      'id, user_id, name, domain',
    );

    await enforceRateLimit(supabase, brandId, 'brand-agent-research', 3, 300);

    const klaviyoApiKey = await getBrandSecret(supabase, brandId, 'klaviyo');
    if (!klaviyoApiKey) {
      return jsonResponse(req, { error: 'Brand has no Klaviyo key — connect it first' }, 400);
    }

    // ---- Mine the last ~20 sent email campaigns from Klaviyo ----
    const filter = encodeURIComponent("and(equals(messages.channel,'email'),equals(status,'Sent'))");
    const response = await fetch(
      `https://a.klaviyo.com/api/campaigns?filter=${filter}&include=campaign-messages&sort=-created_at&page[size]=20`,
      {
        headers: {
          Authorization: `Klaviyo-API-Key ${klaviyoApiKey}`,
          Accept: 'application/vnd.api+json',
          revision: KLAVIYO_REVISION,
        },
      },
    );
    if (!response.ok) {
      const text = await response.text();
      logEvent(ctx, 'error', 'klaviyo_history_failed', { status: response.status, body: text.slice(0, 300) });
      return jsonResponse(req, { error: `Could not read Klaviyo campaign history (${response.status})` }, 502);
    }
    const payload = await response.json();

    const campaigns = (payload.data ?? []).map((c: { attributes?: { name?: string; send_time?: string } }) => ({
      name: c.attributes?.name ?? '',
      sentAt: c.attributes?.send_time ?? '',
    }));
    const messages = (payload.included ?? [])
      .filter((m: { type?: string }) => m.type === 'campaign-message')
      .map((m: { attributes?: { definition?: { content?: { subject?: string; preview_text?: string } } } }) => ({
        subject: m.attributes?.definition?.content?.subject ?? '',
        preview: m.attributes?.definition?.content?.preview_text ?? '',
      }))
      .filter((m: { subject: string }) => m.subject);

    if (messages.length === 0) {
      await supabase.from('agent_runs').insert({
        brand_id: brandId, user_id: brand.user_id, agent: 'research', trigger,
        status: 'success', headline: 'Researched Klaviyo history — no sent campaigns found yet',
        detail: { campaigns: 0 },
      });
      return jsonResponse(req, { success: true, campaigns: 0, learned: 0 });
    }

    // ---- Existing knowledge so research updates rather than duplicates ----
    const { data: existing } = await supabase
      .from('brand_knowledge')
      .select('kind, title')
      .eq('brand_id', brandId)
      .is('superseded_by', null)
      .limit(100);

    const system = `You are the brand-research agent for an email production tool. Brand: "${brand.name}" (${brand.domain}). Today is ${new Date().toISOString().slice(0, 10)}.

You are given the brand's last ${messages.length} SENT Klaviyo email campaigns (names, subject lines, preview texts). Distill durable knowledge that will make future AI-generated campaigns match this brand.

Extract (only when the evidence supports it):
- voice: subject-line style (length, casing, punctuation, emoji use, urgency patterns, personalization), preview-text conventions
- promo: recurring offer patterns (discount levels, free-gift mechanics, sale cadence) — set no expiry, these are patterns not active promos
- fact: anything else durable (flagship products named repeatedly, audience hints)
- question: when something IMPORTANT for producing campaigns cannot be inferred and is worth asking the user (max 2 questions, phrased directly, e.g. "Do you ever use emoji in subject lines, or is the plain style deliberate?")

Every "question" entry MUST include "answer_options": an array of 3-5 plausible, mutually distinct answers the user can pick with ONE CLICK — users never type. Each option is a short, complete answer (under 12 words) covering the realistic range, e.g. ["Yes, emoji are fine anywhere", "Only sparingly, max one per subject line", "Never — plain text is deliberate", "Testing both, no rule yet"]. Do not include vague options like "Other" or "It depends".

Rules: be specific and evidence-based ("8 of 20 subject lines lead with a question" beats "uses questions sometimes"). Skip anything already covered by existing knowledge titles provided. confidence 0.6-0.9 by evidence strength; questions get 0.5.
Return ONLY a JSON array: [{"kind","title","content","confidence","answer_options"?}] — answer_options only on questions. 3-8 entries.`;

    const userMessage = `Existing knowledge titles (do not duplicate):
${(existing ?? []).map((k) => `- [${k.kind}] ${k.title}`).join('\n') || '(none)'}

Sent campaigns (newest first):
${campaigns.slice(0, 20).map((c: { name: string; sentAt: string }, i: number) => `${i + 1}. "${c.name}" (${(c.sentAt || '').slice(0, 10)})`).join('\n')}

Subject lines & preview texts:
${messages.map((m: { subject: string; preview: string }, i: number) => `${i + 1}. SL: "${m.subject}"${m.preview ? ` | PT: "${m.preview}"` : ''}`).join('\n')}`;

    const responseText = await callClaude({
      model: AGENT_MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 3000,
      temperature: 0.2,
    });

    let entries: ResearchEntry[] = [];
    try {
      entries = parseModelJson<ResearchEntry[]>(responseText);
    } catch {
      logEvent(ctx, 'warn', 'research_parse_failed', { responseText: responseText.slice(0, 400) });
    }

    const validKinds = new Set(['voice', 'style', 'product', 'promo', 'link_rule', 'fact', 'question']);
    const existingTitles = new Set((existing ?? []).map((k) => k.title.toLowerCase().trim()));
    let inserted = 0;
    let questions = 0;
    for (const entry of entries) {
      if (!validKinds.has(entry.kind) || !entry.title || !entry.content) continue;
      // Dedupe by title — re-running research must never double the wiki.
      const titleKey = entry.title.toLowerCase().trim();
      if (existingTitles.has(titleKey)) continue;
      existingTitles.add(titleKey);
      // Questions carry one-click answer options in metadata for the survey UI.
      const answerOptions = entry.kind === 'question' && Array.isArray(entry.answer_options)
        ? entry.answer_options
            .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
            .map((o) => o.trim().slice(0, 120))
            .slice(0, 5)
        : [];
      const { error } = await supabase.from('brand_knowledge').insert({
        brand_id: brandId,
        user_id: brand.user_id,
        kind: entry.kind,
        title: entry.title.slice(0, 200),
        content: entry.content.slice(0, 4000),
        source: 'crawl',
        confidence: Math.min(Math.max(entry.confidence ?? 0.6, 0), 1),
        metadata: answerOptions.length >= 2 ? { answer_options: answerOptions } : null,
      });
      if (!error) {
        inserted++;
        if (entry.kind === 'question') questions++;
      }
    }

    // Keep ONE raw-evidence digest: drop any previous digest, then insert.
    await supabase
      .from('brand_knowledge')
      .delete()
      .eq('brand_id', brandId)
      .eq('source', 'crawl')
      .like('title', 'Recent subject lines%');
    await supabase.from('brand_knowledge').insert({
      brand_id: brandId,
      user_id: brand.user_id,
      kind: 'voice',
      title: `Recent subject lines (${messages.length} sent campaigns)`,
      content: messages.slice(0, 20).map((m: { subject: string }) => `• ${m.subject}`).join('\n'),
      source: 'crawl',
      confidence: 0.9,
    });
    inserted++;

    await supabase.from('agent_runs').insert({
      brand_id: brandId,
      user_id: brand.user_id,
      agent: 'research',
      trigger: ['scheduled', 'after_push', 'pipeline', 'manual'].includes(trigger) ? trigger : 'manual',
      status: 'success',
      headline: `Researched ${messages.length} sent campaigns — learned ${inserted} thing${inserted === 1 ? '' : 's'}${questions ? `, has ${questions} question${questions === 1 ? '' : 's'} for you` : ''}`,
      detail: { campaigns: campaigns.length, messages: messages.length, learned: inserted, questions },
    });

    logEvent(ctx, 'info', 'research_complete', { brandId, learned: inserted, questions });
    return jsonResponse(req, { success: true, campaigns: campaigns.length, learned: inserted, questions });
  } catch (error: unknown) {
    if (error instanceof AuthError) return jsonResponse(req, { error: error.message }, error.status);
    if (error instanceof RateLimitError) return jsonResponse(req, { error: error.message }, 429);
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
