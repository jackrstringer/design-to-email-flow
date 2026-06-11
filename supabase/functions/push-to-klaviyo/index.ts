// push-to-klaviyo — assembles the final email HTML from slices and pushes it
// to Klaviyo as a template (and optionally a campaign).
//
// Hardened rewrite. Changes vs the original:
//  - Auth is REQUIRED and the JWT is signature-verified (the old code decoded
//    the payload with atob() and skipped the ownership check when no header
//    was sent at all).
//  - The Klaviyo API key is resolved server-side from Vault via brandId. The
//    client can no longer supply a key, and keys never reach the browser.
//  - Re-pushes UPDATE the existing template in place (PATCH) instead of
//    creating a new orphan template every time.
//  - One API revision for all calls (was 2025-01-15 / 2025-10-15 drift).
//  - Idempotency: an x-idempotency-key (or body idempotencyKey) returns the
//    previously created result instead of duplicating templates/campaigns.
//  - Slice images are mirrored into Klaviyo's image library so sent emails
//    survive ImageKit/Cloudinary outages or URL changes.
//  - All interpolated strings are escaped; links validated as http(s).
//  - Rate limited per user.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, requireBrandAccess, serviceClient, AuthError } from "../_shared/auth.ts";
import { getBrandSecret } from "../_shared/secrets.ts";
import { escapeHtml, safeHttpUrl, stripActiveContent } from "../_shared/html.ts";
import { enforceRateLimit, RateLimitError } from "../_shared/ratelimit.ts";
import { newTrace, logEvent, sanitizeError } from "../_shared/log.ts";
import {
  createTemplate,
  updateTemplate,
  createCampaign,
  assignTemplateToMessage,
  mirrorImageToKlaviyo,
} from "../_shared/klaviyo.ts";

interface SliceData {
  imageUrl: string;
  altText: string;
  link?: string | null;
  type?: 'image' | 'html';
  htmlContent?: string;
  column?: number;
  totalColumns?: number;
  rowIndex?: number;
}

function renderSliceImg(slice: SliceData, width: number): string {
  const alt = escapeHtml(slice.altText || 'Email image');
  const src = safeHttpUrl(slice.imageUrl) ?? '';
  return `<img src="${escapeHtml(src)}" width="${width}" style="display: block; width: 100%; height: auto;" alt="${alt}" />`;
}

function renderCell(slice: SliceData, widthPx: number, widthAttr: string): string {
  const region = `data-klaviyo-region="true" data-klaviyo-region-width-pixels="${widthPx}"`;
  if (slice.type === 'html' && slice.htmlContent) {
    return `<td ${widthAttr} valign="top" style="padding: 0;" ${region}>
      <div class="klaviyo-block klaviyo-text-block">
        ${stripActiveContent(slice.htmlContent)}
      </div>
    </td>`;
  }
  const imgTag = renderSliceImg(slice, widthPx);
  const link = safeHttpUrl(slice.link);
  const inner = link
    ? `<a href="${escapeHtml(link)}" target="_blank" style="text-decoration: none;">
          ${imgTag}
        </a>`
    : imgTag;
  return `<td ${widthAttr} valign="top" style="padding: 0;" ${region}>
      <div class="klaviyo-block klaviyo-image-block">
        ${inner}
      </div>
    </td>`;
}

function buildSliceRows(slicesArray: SliceData[]): string {
  slicesArray.forEach((slice, index) => {
    if (slice.rowIndex === undefined || slice.rowIndex === null) {
      slice.rowIndex = index;
    }
  });

  const rowGroups = new Map<number, SliceData[]>();
  slicesArray.forEach((slice) => {
    const rowIdx = slice.rowIndex ?? 0;
    if (!rowGroups.has(rowIdx)) rowGroups.set(rowIdx, []);
    rowGroups.get(rowIdx)!.push(slice);
  });

  const sortedRows = Array.from(rowGroups.entries()).sort((a, b) => a[0] - b[0]);

  return sortedRows
    .map(([, rowSlices]) => {
      rowSlices.sort((a, b) => (a.column ?? 0) - (b.column ?? 0));
      const totalColumns = rowSlices[0]?.totalColumns ?? 1;

      if (totalColumns === 1) {
        return `<tr>
            ${renderCell(rowSlices[0], 600, '')}
          </tr>`;
      }

      const columnWidth = Math.floor(600 / totalColumns);
      const columnPercent = (100 / totalColumns).toFixed(2);
      const columnCells = rowSlices
        .map((slice) => renderCell(slice, columnWidth, `width="${columnPercent}%"`))
        .join('\n              ');

      return `<tr>
  <td align="center" style="padding: 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
      <tr>
        ${columnCells}
      </tr>
    </table>
  </td>
</tr>`;
    })
    .join('\n');
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const ctx = newTrace('push-to-klaviyo', req);

  try {
    const auth = await requireAuth(req);
    const body = await req.json();
    const {
      imageUrl,
      templateName,
      campaignName, // legacy alias
      brandId,
      footerHtml,
      mode = 'template',
      listId,
      slices,
      includedSegments,
      excludedSegments,
      subjectLine,
      previewText,
      queueId, // campaign_queue row, used to find an existing template to update
      existingTemplateId, // explicit override
      mirrorImages = true,
    } = body;

    const idempotencyKey: string | null =
      req.headers.get('x-idempotency-key') || body.idempotencyKey || null;

    if (!brandId) {
      return jsonResponse(req, { error: 'brandId is required' }, 400);
    }

    const supabase = serviceClient();
    const brand = await requireBrandAccess(
      supabase,
      brandId,
      auth,
      'id, user_id, footer_html, klaviyo_key_set',
    );
    const effectiveUserId = auth.userId ?? (brand.user_id as string | null);

    await enforceRateLimit(supabase, effectiveUserId ?? brandId, 'push-to-klaviyo', 10, 60);

    // Idempotency: replay a previous successful push.
    if (idempotencyKey) {
      const { data: prior } = await supabase
        .from('klaviyo_push_log')
        .select('template_id, campaign_id, campaign_url, mode')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (prior?.template_id) {
        logEvent(ctx, 'info', 'idempotent_replay', { idempotencyKey });
        return jsonResponse(req, {
          success: true,
          replayed: true,
          templateId: prior.template_id,
          campaignId: prior.campaign_id,
          campaignUrl: prior.campaign_url,
        });
      }
    }

    const klaviyoApiKey = await getBrandSecret(supabase, brandId, 'klaviyo');
    if (!klaviyoApiKey) {
      return jsonResponse(
        req,
        { error: 'Brand does not have a Klaviyo API key configured' },
        400,
      );
    }

    const resolvedTemplateName = templateName || campaignName;
    const resolvedFooterHtml = footerHtml || (brand.footer_html as string | null) || '';
    const hasSlices = Array.isArray(slices) && slices.length > 0;

    if ((!imageUrl && !hasSlices) || !resolvedTemplateName) {
      return jsonResponse(
        req,
        { error: 'Missing required fields: imageUrl or slices, templateName' },
        400,
      );
    }

    // Resolve an existing template id for in-place update on re-push.
    let templateIdToUpdate: string | null = existingTemplateId ?? null;
    if (!templateIdToUpdate && queueId) {
      const { data: queueRow } = await supabase
        .from('campaign_queue')
        .select('klaviyo_template_id, user_id')
        .eq('id', queueId)
        .maybeSingle();
      if (queueRow && (auth.isService || queueRow.user_id === auth.userId)) {
        templateIdToUpdate = queueRow.klaviyo_template_id;
      }
    }

    logEvent(ctx, 'info', 'push_start', {
      brandId,
      mode,
      sliceCount: hasSlices ? slices.length : 0,
      updatingTemplate: !!templateIdToUpdate,
    });

    // Mirror slice images into Klaviyo's image library (durability). Falls
    // back to the original CDN URL per-image on failure.
    let workingSlices: SliceData[] | null = hasSlices ? [...(slices as SliceData[])] : null;
    if (workingSlices && mirrorImages) {
      const mirrored = await Promise.all(
        workingSlices.map(async (slice, i) => {
          if (slice.type === 'html' || !slice.imageUrl) return slice;
          const klaviyoUrl = await mirrorImageToKlaviyo(
            klaviyoApiKey,
            slice.imageUrl,
            `${resolvedTemplateName} - slice ${i + 1}`,
          );
          return klaviyoUrl ? { ...slice, imageUrl: klaviyoUrl } : slice;
        }),
      );
      const mirroredCount = mirrored.filter((s, i) => s.imageUrl !== workingSlices![i].imageUrl).length;
      logEvent(ctx, 'info', 'images_mirrored', { mirroredCount, total: mirrored.length });
      workingSlices = mirrored;
    }

    const darkModeCss = resolvedFooterHtml
      ? `
  <style type="text/css">
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    @media (prefers-color-scheme: dark) {
      .darkmode-text { color: #ffffff !important; }
    }
  </style>`
      : '';

    let imageContent: string;
    if (workingSlices) {
      imageContent = buildSliceRows(workingSlices);
    } else {
      const src = safeHttpUrl(imageUrl);
      if (!src) {
        return jsonResponse(req, { error: 'imageUrl must be a valid http(s) URL' }, 400);
      }
      imageContent = `<tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
              <div class="klaviyo-block klaviyo-image-block">
                <img src="${escapeHtml(src)}" width="600" style="display: block; width: 100%; height: auto;" alt="${escapeHtml(resolvedTemplateName)}" />
              </div>
            </td>
          </tr>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(resolvedTemplateName)}</title>${darkModeCss}
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff;">
          ${imageContent}${stripActiveContent(resolvedFooterHtml)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Create or update the template.
    let templateId: string;
    if (templateIdToUpdate) {
      const result = await updateTemplate(klaviyoApiKey, templateIdToUpdate, resolvedTemplateName, html);
      if (result.error) {
        // Template may have been deleted in Klaviyo — fall back to create.
        logEvent(ctx, 'warn', 'template_update_failed_fallback_create', {
          templateId: templateIdToUpdate,
          status: result.error.status,
        });
        const created = await createTemplate(klaviyoApiKey, resolvedTemplateName, html);
        if (created.error) {
          return jsonResponse(req, { error: created.error.detail }, created.error.status);
        }
        templateId = created.templateId!;
      } else {
        templateId = result.templateId!;
      }
    } else {
      const created = await createTemplate(klaviyoApiKey, resolvedTemplateName, html);
      if (created.error) {
        return jsonResponse(req, { error: created.error.detail }, created.error.status);
      }
      templateId = created.templateId!;
    }
    logEvent(ctx, 'info', 'template_ready', { templateId, updated: !!templateIdToUpdate });

    // After a successful push, hand corrections to the learning agent. Awaited
    // (bounded) because fire-and-forget work dies with the isolate.
    const triggerLearning = async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/brand-agent-learn`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SERVICE_ROLE_JWT') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ brandId, queueId: queueId ?? undefined, trigger: 'after_push' }),
        });
        clearTimeout(timer);
      } catch (err) {
        logEvent(ctx, 'warn', 'learning_trigger_failed', { error: String(err) });
      }
    };

    const recordPush = async (campaignId: string | null, campaignUrl: string | null) => {
      await supabase.from('klaviyo_push_log').insert({
        user_id: effectiveUserId,
        brand_id: brandId,
        queue_id: queueId ?? null,
        idempotency_key: idempotencyKey,
        mode,
        template_id: templateId,
        campaign_id: campaignId,
        campaign_url: campaignUrl,
      });
      if (queueId) {
        await supabase
          .from('campaign_queue')
          .update({
            klaviyo_template_id: templateId,
            ...(campaignId
              ? {
                  klaviyo_campaign_id: campaignId,
                  klaviyo_campaign_url: campaignUrl,
                  sent_to_klaviyo_at: new Date().toISOString(),
                  status: 'sent_to_klaviyo',
                }
              : {}),
          })
          .eq('id', queueId);
      }
    };

    if (mode === 'template') {
      await recordPush(null, null);
      await triggerLearning();
      return jsonResponse(req, {
        success: true,
        templateId,
        message: templateIdToUpdate ? 'Template updated successfully' : 'Template created successfully',
      });
    }

    // Campaign mode
    if (!listId && (!includedSegments || includedSegments.length === 0)) {
      return jsonResponse(req, { error: 'listId or includedSegments is required for campaign mode' }, 400);
    }

    const included = includedSegments && includedSegments.length > 0 ? includedSegments : [listId];
    const excluded = excludedSegments || [];

    const campaign = await createCampaign(klaviyoApiKey, {
      name: resolvedTemplateName,
      included,
      excluded,
      subject: subjectLine || 'Hi there',
      previewText: previewText || '',
    });

    if (campaign.error) {
      logEvent(ctx, 'error', 'campaign_create_failed', {
        templateId,
        detail: campaign.error.detail,
      });
      await recordPush(null, null);
      return jsonResponse(req, {
        success: true,
        templateId,
        error: `Template created but campaign failed: ${campaign.error.detail}`,
      });
    }

    if (!campaign.campaignMessageId) {
      await recordPush(campaign.campaignId ?? null, null);
      return jsonResponse(req, {
        success: true,
        templateId,
        campaignId: campaign.campaignId,
        error: 'Campaign created but could not get message ID to assign template',
      });
    }

    const assign = await assignTemplateToMessage(klaviyoApiKey, campaign.campaignMessageId, templateId);
    if (assign.error) {
      await recordPush(campaign.campaignId ?? null, null);
      return jsonResponse(req, {
        success: true,
        templateId,
        campaignId: campaign.campaignId,
        error: 'Campaign created but template assignment failed',
      });
    }

    const campaignUrl = `https://www.klaviyo.com/email-template-editor/campaign/${campaign.campaignId}/content/edit`;
    await recordPush(campaign.campaignId!, campaignUrl);
    await triggerLearning();

    logEvent(ctx, 'info', 'push_complete', {
      templateId,
      campaignId: campaign.campaignId,
    });

    return jsonResponse(req, {
      success: true,
      templateId,
      campaignId: campaign.campaignId,
      campaignUrl,
      message: 'Campaign created successfully with template',
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return jsonResponse(req, { error: error.message }, error.status);
    }
    if (error instanceof RateLimitError) {
      return jsonResponse(req, { error: error.message }, 429);
    }
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
