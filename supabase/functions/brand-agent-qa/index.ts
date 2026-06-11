// brand-agent-qa — the pre-push QA half of the brand knowledge layer.
//
// Given a campaign that is ready for review, it checks the campaign against
// everything the system knows about the brand and the real world:
//   - every link is fetched server-side and must resolve (2xx/3xx)
//   - promo/date consistency vs today's date (expired offer copy, wrong year)
//   - link conventions and past-mistake knowledge from brand_knowledge
//   - subject line / preview text against the brand's voice knowledge
//   - structural checks: missing alt text, missing links on CTA slices,
//     footer present, unsubscribe merge tag present
//
// Results are written to campaign_queue.qa_flags in a backward-compatible
// shape ({ type, severity, category, message, sliceIndex }) so the existing
// review UI surfaces them, and returned to the caller.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, requireBrandAccess, serviceClient, AuthError } from "../_shared/auth.ts";
import { newTrace, logEvent, sanitizeError } from "../_shared/log.ts";
import { enforceRateLimit, RateLimitError } from "../_shared/ratelimit.ts";
import { callClaude, parseModelJson, AGENT_MODEL } from "../_shared/anthropic.ts";

interface QaFlag {
  type: string; // legacy field consumed by StatusSelector badge counts
  severity: 'error' | 'warning' | 'info';
  category: 'link' | 'date' | 'voice' | 'structure' | 'brand_rule' | 'spelling';
  message: string;
  sliceIndex?: number;
}

interface SliceLike {
  imageUrl?: string;
  altText?: string;
  link?: string | null;
  type?: string;
  htmlContent?: string;
  hasCTA?: boolean;
  ctaText?: string | null;
}

async function checkLink(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailQA/1.0)' },
    });
    // Some shops reject HEAD; retry with GET.
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailQA/1.0)' },
      });
    }
    clearTimeout(timer);
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const ctx = newTrace('brand-agent-qa', req);

  try {
    const auth = await requireAuth(req);
    const { brandId, queueId } = await req.json();
    if (!brandId || !queueId) {
      return jsonResponse(req, { error: 'brandId and queueId are required' }, 400);
    }

    const supabase = serviceClient();
    const brand = await requireBrandAccess(
      supabase, brandId, auth,
      'id, user_id, name, domain, footer_html, link_preferences',
    );

    await enforceRateLimit(supabase, brandId, 'brand-agent-qa', 10, 60);

    const { data: queueRow } = await supabase
      .from('campaign_queue')
      .select('id, user_id, name, slices, selected_subject_line, selected_preview_text, generated_subject_lines, spelling_errors')
      .eq('id', queueId)
      .maybeSingle();
    if (!queueRow) return jsonResponse(req, { error: 'Campaign not found' }, 404);
    if (!auth.isService && queueRow.user_id !== auth.userId) {
      return jsonResponse(req, { error: 'Not authorized for this campaign' }, 403);
    }

    const slices: SliceLike[] = Array.isArray(queueRow.slices) ? (queueRow.slices as SliceLike[]) : [];
    const flags: QaFlag[] = [];

    // ---- Deterministic structural checks (no model involved) ----
    slices.forEach((slice, i) => {
      if (slice.type !== 'html' && !slice.altText?.trim()) {
        flags.push({
          type: 'missing_alt_text', severity: 'warning', category: 'structure',
          message: `Slice ${i + 1} has no alt text (hurts accessibility and clipped-image rendering).`,
          sliceIndex: i,
        });
      }
      if (slice.hasCTA && !slice.link) {
        flags.push({
          type: 'cta_without_link', severity: 'error', category: 'link',
          message: `Slice ${i + 1} has CTA "${slice.ctaText ?? ''}" but no link assigned.`,
          sliceIndex: i,
        });
      }
    });

    // Surface stored spelling errors in the same unified flag list.
    const spellingErrors = Array.isArray(queueRow.spelling_errors)
      ? (queueRow.spelling_errors as Array<{ word?: string; suggestion?: string; context?: string }>)
      : [];
    for (const err of spellingErrors) {
      flags.push({
        type: 'spelling', severity: 'warning', category: 'spelling',
        message: `Possible typo: "${err.word ?? ''}"${err.suggestion ? ` → "${err.suggestion}"` : ''}${err.context ? ` (${err.context})` : ''}`,
      });
    }

    // Footers live in brand_footers (primary) with brands.footer_html as
    // legacy fallback — check both before flagging a compliance risk.
    let footerHtml = (brand.footer_html as string | null) ?? '';
    if (!footerHtml) {
      const { data: footers } = await supabase
        .from('brand_footers')
        .select('html, is_primary')
        .eq('brand_id', brandId)
        .order('is_primary', { ascending: false })
        .limit(1);
      footerHtml = footers?.[0]?.html ?? '';
    }
    if (!footerHtml) {
      flags.push({
        type: 'missing_footer', severity: 'error', category: 'structure',
        message: 'Brand has no footer configured — emails will go out without unsubscribe links (CAN-SPAM/GDPR risk).',
      });
    } else if (!footerHtml.includes('unsubscribe')) {
      flags.push({
        type: 'missing_unsubscribe', severity: 'error', category: 'structure',
        message: 'Footer HTML does not contain an unsubscribe merge tag.',
      });
    }

    // ---- Live link verification (parallel, server-side) ----
    const linkChecks = await Promise.all(
      slices.map(async (slice, i) => {
        if (!slice.link) return null;
        const result = await checkLink(slice.link);
        return result.ok ? null : ({
          type: 'broken_link', severity: 'error', category: 'link',
          message: `Slice ${i + 1} link ${slice.link} returned ${result.status || 'network error'}.`,
          sliceIndex: i,
        } as QaFlag);
      }),
    );
    flags.push(...linkChecks.filter((f): f is QaFlag => f !== null));

    // ---- Knowledge-based agentic review ----
    const { data: knowledge } = await supabase
      .from('brand_knowledge')
      .select('kind, title, content, confidence, valid_until')
      .eq('brand_id', brandId)
      .is('superseded_by', null)
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
      .order('confidence', { ascending: false })
      .limit(60);

    if ((knowledge && knowledge.length > 0) || queueRow.selected_subject_line) {
      const system = `You are the brand QA agent for "${brand.name}" (${brand.domain}). Today is ${new Date().toISOString().slice(0, 10)}.
Review the campaign below against the brand knowledge. Flag ONLY real, specific problems a senior email marketer would stop a send for. Do not flag stylistic preferences not grounded in the provided knowledge. Categories: link (wrong destination per brand rules), date (expired/inconsistent promo dates, wrong day-of-week, stale year), voice (violates documented voice rules), brand_rule (contradicts any other documented knowledge).
Return ONLY a JSON array (possibly empty): [{"severity":"error"|"warning"|"info","category":"link"|"date"|"voice"|"brand_rule","message":"...", "sliceIndex": n|null}]`;

      const userMessage = `Brand knowledge:
${(knowledge ?? []).map((k) => `- [${k.kind}, conf ${k.confidence}${k.valid_until ? `, valid until ${k.valid_until}` : ''}] ${k.title}: ${k.content}`).join('\n') || '(none)'}

Campaign "${queueRow.name ?? 'unnamed'}":
Subject line: ${queueRow.selected_subject_line ?? '(not selected)'}
Preview text: ${queueRow.selected_preview_text ?? '(not selected)'}
Slices:
${slices.map((s, i) => `${i + 1}. ${s.type === 'html' ? `HTML block: ${(s.htmlContent ?? '').replace(/<[^>]+>/g, ' ').slice(0, 300)}` : `image alt="${s.altText ?? ''}"`}${s.link ? ` → ${s.link}` : ''}${s.ctaText ? ` (CTA: "${s.ctaText}")` : ''}`).join('\n')}`;

      try {
        const responseText = await callClaude({
          model: AGENT_MODEL,
          system,
          messages: [{ role: 'user', content: userMessage }],
          maxTokens: 3000,
          temperature: 0,
        });
        const agentFlags = parseModelJson<Array<Omit<QaFlag, 'type'>>>(responseText);
        for (const flag of agentFlags) {
          if (!flag.message || !['error', 'warning', 'info'].includes(flag.severity)) continue;
          flags.push({
            type: `agent_${flag.category}`,
            severity: flag.severity,
            category: (flag.category as QaFlag['category']) ?? 'brand_rule',
            message: flag.message,
            ...(typeof flag.sliceIndex === 'number' ? { sliceIndex: flag.sliceIndex } : {}),
          });
        }
      } catch (err) {
        logEvent(ctx, 'warn', 'agent_review_failed', { error: String(err) });
      }
    }

    await supabase
      .from('campaign_queue')
      .update({ qa_flags: flags })
      .eq('id', queueId);

    logEvent(ctx, 'info', 'qa_complete', {
      queueId,
      flags: flags.length,
      errors: flags.filter((f) => f.severity === 'error').length,
    });

    const errorCount = flags.filter((f) => f.severity === 'error').length;
    const warnCount = flags.filter((f) => f.severity === 'warning').length;
    await supabase.from('agent_runs').insert({
      brand_id: brandId,
      user_id: brand.user_id,
      agent: 'qa',
      trigger: auth.isService ? 'pipeline' : 'manual',
      status: 'success',
      headline:
        flags.length === 0
          ? `Reviewed "${queueRow.name ?? 'campaign'}" — no issues found`
          : `Reviewed "${queueRow.name ?? 'campaign'}" — ${errorCount} error${errorCount === 1 ? '' : 's'}, ${warnCount} warning${warnCount === 1 ? '' : 's'}`,
      detail: { queueId, flagCount: flags.length, errors: errorCount, warnings: warnCount },
    });

    return jsonResponse(req, {
      success: true,
      flags,
      summary: {
        errors: flags.filter((f) => f.severity === 'error').length,
        warnings: flags.filter((f) => f.severity === 'warning').length,
        info: flags.filter((f) => f.severity === 'info').length,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return jsonResponse(req, { error: error.message }, error.status);
    if (error instanceof RateLimitError) return jsonResponse(req, { error: error.message }, 429);
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
