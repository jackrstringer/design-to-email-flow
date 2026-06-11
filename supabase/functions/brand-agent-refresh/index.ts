// brand-agent-refresh — keeps the brand knowledge layer current.
//
// Designed to run on a schedule (daily; see DEPLOYMENT.md for cron setup) or
// on demand. For each brand (or a single { brandId }):
//   1. Re-verifies link health for the most-used brand_link_index entries
//      whose last_verified_at is stale, updating is_healthy /
//      verification_failures (the old pipeline tracked these fields but
//      nothing ever refreshed them).
//   2. Marks expired promo knowledge as superseded so the QA agent stops
//      applying it.
//   3. Processes any unprocessed knowledge_events backlog via
//      brand-agent-learn (covers corrections that never triggered learning).
//
// Service-role or owner-authenticated calls only.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, serviceClient, AuthError } from "../_shared/auth.ts";
import { newTrace, logEvent, sanitizeError } from "../_shared/log.ts";

const LINKS_PER_BRAND = 40;
const STALE_DAYS = 7;

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response = await fetch(url, {
      method: 'HEAD', redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailQA/1.0)' },
    });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: 'GET', redirect: 'follow', signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailQA/1.0)' },
      });
    }
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const ctx = newTrace('brand-agent-refresh', req);

  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const requestedBrandId: string | undefined = body.brandId;

    const supabase = serviceClient();

    let brandsQuery = supabase.from('brands').select('id, user_id, name');
    if (requestedBrandId) brandsQuery = brandsQuery.eq('id', requestedBrandId);
    else if (!auth.isService) brandsQuery = brandsQuery.eq('user_id', auth.userId);
    const { data: brands } = await brandsQuery.limit(50);

    if (!brands || brands.length === 0) {
      return jsonResponse(req, { success: true, brands: 0 });
    }
    // Single-brand call by a user still needs an ownership check.
    if (requestedBrandId && !auth.isService && brands[0].user_id !== auth.userId) {
      return jsonResponse(req, { error: 'Not authorized for this brand' }, 403);
    }

    const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
    const summary: Record<string, { linksChecked: number; linksUnhealthy: number; promosExpired: number; eventsProcessed: number }> = {};

    for (const brand of brands) {
      const result = { linksChecked: 0, linksUnhealthy: 0, promosExpired: 0, eventsProcessed: 0 };

      // 1. Stale link health refresh — most-used links first (they're the
      //    ones the matcher will hand out next).
      const { data: links } = await supabase
        .from('brand_link_index')
        .select('id, url, verification_failures')
        .eq('brand_id', brand.id)
        .or(`last_verified_at.is.null,last_verified_at.lt.${staleCutoff}`)
        .order('use_count', { ascending: false, nullsFirst: false })
        .limit(LINKS_PER_BRAND);

      if (links && links.length > 0) {
        const checks = await Promise.all(links.map(async (link) => ({
          link,
          healthy: await verifyUrl(link.url),
        })));
        for (const { link, healthy } of checks) {
          result.linksChecked++;
          if (!healthy) result.linksUnhealthy++;
          await supabase
            .from('brand_link_index')
            .update({
              is_healthy: healthy,
              last_verified_at: new Date().toISOString(),
              verification_failures: healthy ? 0 : (link.verification_failures ?? 0) + 1,
            })
            .eq('id', link.id);
        }
        // Links that failed 3+ consecutive checks should never be matched again.
        await supabase
          .from('brand_link_index')
          .delete()
          .eq('brand_id', brand.id)
          .gte('verification_failures', 3);
      }

      // 2. Expire stale promo knowledge.
      const { data: expired } = await supabase
        .from('brand_knowledge')
        .update({ updated_at: new Date().toISOString(), confidence: 0 })
        .eq('brand_id', brand.id)
        .eq('kind', 'promo')
        .lt('valid_until', new Date().toISOString())
        .gt('confidence', 0)
        .select('id');
      result.promosExpired = expired?.length ?? 0;

      // 2.5 First-time research: a brand with a Klaviyo key but no voice
      //     knowledge gets its history mined automatically.
      const { count: voiceCount } = await supabase
        .from('brand_knowledge')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('kind', 'voice')
        .is('superseded_by', null);
      if ((voiceCount ?? 0) === 0) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/brand-agent-research`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SERVICE_ROLE_JWT') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ brandId: brand.id, trigger: 'scheduled' }),
        }).catch(() => {});
      }

      // 3. Process learning backlog.
      const { count } = await supabase
        .from('knowledge_events')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('processed', false);
      if ((count ?? 0) > 0) {
        const learnRes = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/brand-agent-learn`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SERVICE_ROLE_JWT') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ brandId: brand.id }),
          },
        );
        if (learnRes.ok) {
          const learned = await learnRes.json();
          result.eventsProcessed = learned.eventsProcessed ?? 0;
        }
      }

      summary[brand.id] = result;
      logEvent(ctx, 'info', 'brand_refreshed', { brandId: brand.id, ...result });

      const parts: string[] = [];
      if (result.linksChecked > 0) {
        parts.push(`verified ${result.linksChecked} links${result.linksUnhealthy ? ` (${result.linksUnhealthy} dead)` : ''}`);
      }
      if (result.promosExpired > 0) parts.push(`expired ${result.promosExpired} stale promo${result.promosExpired === 1 ? '' : 's'}`);
      if (result.eventsProcessed > 0) parts.push(`processed ${result.eventsProcessed} correction${result.eventsProcessed === 1 ? '' : 's'}`);
      await supabase.from('agent_runs').insert({
        brand_id: brand.id,
        user_id: brand.user_id,
        agent: 'refresh',
        trigger: auth.isService ? 'scheduled' : 'manual',
        status: 'success',
        headline: parts.length > 0 ? `Maintenance: ${parts.join(', ')}` : 'Maintenance sweep — everything current',
        detail: result,
      });
    }

    return jsonResponse(req, { success: true, brands: brands.length, summary });
  } catch (error: unknown) {
    if (error instanceof AuthError) return jsonResponse(req, { error: error.message }, error.status);
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
