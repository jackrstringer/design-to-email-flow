// brand-agent-learn — the learning half of the brand knowledge layer.
//
// Distills raw knowledge_events (user corrections made during campaign
// review: fixed links, edited alt text, rewritten copy) plus the final
// approved campaign into durable brand_knowledge entries. Called after a
// campaign is pushed (fire-and-forget from the UI or orchestrator), or on
// demand with { brandId } to process any backlog.
//
// The agent compares what the AI originally produced with what the user
// shipped, and writes lessons it can apply next time — e.g. "CTA 'Shop
// Bestsellers' must link to /collections/best-sellers, the user has corrected
// this twice" or "Subject lines never use emoji for this brand."

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, requireBrandAccess, serviceClient, AuthError } from "../_shared/auth.ts";
import { newTrace, logEvent, sanitizeError } from "../_shared/log.ts";
import { enforceRateLimit, RateLimitError } from "../_shared/ratelimit.ts";
import { callClaude, parseModelJson, AGENT_MODEL } from "../_shared/anthropic.ts";

interface Lesson {
  kind: 'voice' | 'style' | 'product' | 'promo' | 'link_rule' | 'mistake' | 'fact';
  title: string;
  content: string;
  confidence: number;
  valid_until: string | null;
  /** id of an existing knowledge entry this supersedes, or null */
  supersedes: string | null;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const ctx = newTrace('brand-agent-learn', req);

  try {
    const auth = await requireAuth(req);
    const { brandId, queueId, trigger = 'manual' } = await req.json();
    if (!brandId) return jsonResponse(req, { error: 'brandId is required' }, 400);

    const supabase = serviceClient();
    const brand = await requireBrandAccess(
      supabase, brandId, auth,
      'id, user_id, name, domain, link_preferences',
    );

    await enforceRateLimit(supabase, brandId, 'brand-agent-learn', 6, 60);

    // 1. Unprocessed correction events for this brand (optionally one queue item).
    let eventsQuery = supabase
      .from('knowledge_events')
      .select('id, queue_id, event_type, before, after, created_at')
      .eq('brand_id', brandId)
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(50);
    if (queueId) eventsQuery = eventsQuery.eq('queue_id', queueId);
    const { data: events } = await eventsQuery;

    if (!events || events.length === 0) {
      return jsonResponse(req, { success: true, lessonsLearned: 0, message: 'No unprocessed events' });
    }

    // 2. Existing knowledge so the agent updates instead of duplicating.
    const { data: existing } = await supabase
      .from('brand_knowledge')
      .select('id, kind, title, content, confidence')
      .eq('brand_id', brandId)
      .is('superseded_by', null)
      .order('updated_at', { ascending: false })
      .limit(100);

    // 3. The shipped campaign for context, when available.
    let campaignContext = '';
    if (queueId) {
      const { data: queueRow } = await supabase
        .from('campaign_queue')
        .select('name, slices, selected_subject_line, selected_preview_text')
        .eq('id', queueId)
        .maybeSingle();
      if (queueRow) {
        campaignContext = `\n\nFinal shipped campaign "${queueRow.name ?? 'unnamed'}":\nSubject: ${queueRow.selected_subject_line ?? 'n/a'}\nPreview: ${queueRow.selected_preview_text ?? 'n/a'}\nSlices: ${JSON.stringify(queueRow.slices ?? []).slice(0, 6000)}`;
      }
    }

    const system = `You are the brand-memory agent for an email production tool. Brand: "${brand.name}" (${brand.domain}). Today is ${new Date().toISOString().slice(0, 10)}.

You receive correction events — diffs between what the AI pipeline produced and what the human marketer shipped. Distill them into durable, reusable lessons.

Rules:
- Only record lessons that will change FUTURE behavior. Skip one-off facts with no predictive value.
- Prefer precise, actionable phrasing: "CTA text 'X' should link to URL Y" beats "user changed a link".
- kind: link_rule (CTA/URL conventions), voice (tone/wording), style (visual/HTML), product (catalog facts), promo (time-bound offers — ALWAYS set valid_until), mistake (recurring AI errors to avoid), fact (other durable brand facts).
- confidence: 0.5 for a single observation, 0.75 for a clear correction, 0.9+ only for repeated patterns or explicit statements.
- If a lesson refines an EXISTING knowledge entry (provided below), set "supersedes" to that entry's id.
- Return ONLY a JSON array of lessons (possibly empty): [{"kind","title","content","confidence","valid_until","supersedes"}]. valid_until is an ISO date or null.`;

    const userMessage = `Existing brand knowledge (id | kind | title | content):
${(existing ?? []).map((k) => `${k.id} | ${k.kind} | ${k.title} | ${k.content}`).join('\n') || '(none yet)'}

Correction events to learn from:
${events.map((e) => `- [${e.event_type}] before: ${JSON.stringify(e.before).slice(0, 1500)} → after: ${JSON.stringify(e.after).slice(0, 1500)}`).join('\n')}${campaignContext}`;

    const responseText = await callClaude({
      model: AGENT_MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4000,
      temperature: 0.2,
    });

    let lessons: Lesson[] = [];
    try {
      lessons = parseModelJson<Lesson[]>(responseText);
    } catch {
      logEvent(ctx, 'warn', 'lesson_parse_failed', { responseText: responseText.slice(0, 500) });
    }

    const validKinds = new Set(['voice', 'style', 'product', 'promo', 'link_rule', 'mistake', 'fact']);
    let inserted = 0;
    for (const lesson of lessons) {
      if (!validKinds.has(lesson.kind) || !lesson.title || !lesson.content) continue;
      const { data: newRow, error } = await supabase
        .from('brand_knowledge')
        .insert({
          brand_id: brandId,
          user_id: brand.user_id,
          kind: lesson.kind,
          title: lesson.title.slice(0, 200),
          content: lesson.content.slice(0, 4000),
          source: 'user_correction',
          confidence: Math.min(Math.max(lesson.confidence ?? 0.6, 0), 1),
          valid_until: lesson.valid_until ?? null,
        })
        .select('id')
        .single();
      if (!error && newRow) {
        inserted++;
        if (lesson.supersedes) {
          await supabase
            .from('brand_knowledge')
            .update({ superseded_by: newRow.id, updated_at: new Date().toISOString() })
            .eq('id', lesson.supersedes)
            .eq('brand_id', brandId);
        }
        // Best-effort embedding for semantic recall; non-fatal on failure.
        try {
          const embedRes = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embedding`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get('SERVICE_ROLE_JWT') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ text: `${lesson.title}: ${lesson.content}` }),
            },
          );
          if (embedRes.ok) {
            const { embedding } = await embedRes.json();
            if (embedding) {
              await supabase.from('brand_knowledge').update({ embedding }).eq('id', newRow.id);
            }
          }
        } catch { /* embedding is optional */ }
      }
    }

    await supabase
      .from('knowledge_events')
      .update({ processed: true })
      .in('id', events.map((e) => e.id));

    logEvent(ctx, 'info', 'learn_complete', { events: events.length, lessons: inserted });

    await supabase.from('agent_runs').insert({
      brand_id: brandId,
      user_id: brand.user_id,
      agent: 'learn',
      trigger: ['scheduled', 'after_push', 'pipeline', 'manual'].includes(trigger) ? trigger : 'manual',
      status: 'success',
      headline: inserted > 0
        ? `Learned ${inserted} lesson${inserted === 1 ? '' : 's'} from ${events.length} correction${events.length === 1 ? '' : 's'}`
        : `Reviewed ${events.length} correction${events.length === 1 ? '' : 's'} — nothing new to learn`,
      detail: { eventsProcessed: events.length, lessonsLearned: inserted, queueId: queueId ?? null },
    });

    return jsonResponse(req, { success: true, eventsProcessed: events.length, lessonsLearned: inserted });
  } catch (error: unknown) {
    if (error instanceof AuthError) return jsonResponse(req, { error: error.message }, error.status);
    if (error instanceof RateLimitError) return jsonResponse(req, { error: error.message }, 429);
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
