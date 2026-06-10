// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, requireBrandAccess, serviceClient, AuthError } from "../_shared/auth.ts";
import { getBrandSecret } from "../_shared/secrets.ts";
import { newTrace, sanitizeError } from "../_shared/log.ts";

interface KlaviyoCampaign {
  id: string;
  attributes: {
    name: string;
    status: string;
    created_at: string;
  };
}

interface KlaviyoCampaignMessage {
  id: string;
  attributes: {
    content?: {
      subject?: string;
      preview_text?: string;
    };
    // Legacy fallback fields
    subject?: string;
    preview_text?: string;
  };
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const ctx = newTrace('scrape-klaviyo-copy', req);

  try {
    const auth = await requireAuth(req);
    const { brandId } = await req.json();

    if (!brandId) {
      return jsonResponse(req, { error: 'brandId is required' }, 400);
    }

    const supabase = serviceClient();
    await requireBrandAccess(supabase, brandId, auth);

    const klaviyoApiKey = await getBrandSecret(supabase, brandId, 'klaviyo');
    if (!klaviyoApiKey) {
      return jsonResponse(
        req,
        { error: 'Brand does not have a Klaviyo API key configured' },
        400,
      );
    }

    console.log(`Scraping Klaviyo copy for brand ${brandId}`);

    const subjectLines: string[] = [];
    const previewTexts: string[] = [];
    let nextCursor: string | null = null;
    let totalFetched = 0;
    let messagesFetchedOk = 0;
    let messagesFailed = 0;
    const maxCampaigns = 100;

    // Fetch sent campaigns with pagination
    while (totalFetched < maxCampaigns) {
      // Build URL manually to avoid encoding issues with Klaviyo's bracket syntax
      let urlString =
        "https://a.klaviyo.com/api/campaigns?filter=" +
        encodeURIComponent("equals(messages.channel,'email'),equals(status,'Sent')") +
        "&sort=-created_at";

      // NOTE: The campaigns endpoint supports cursor pagination, but not page[size].
      if (nextCursor) {
        urlString += "&page%5Bcursor%5D=" + encodeURIComponent(nextCursor);
      }

      const campaignsResponse = await fetch(urlString, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'revision': '2024-10-15',
          'Accept': 'application/json',
        },
      });

      if (!campaignsResponse.ok) {
        const errorText = await campaignsResponse.text();
        console.error('Klaviyo campaigns API error:', errorText);

        let detail: string | undefined;
        try {
          const parsed = JSON.parse(errorText);
          detail = parsed?.errors?.[0]?.detail;
        } catch {
          // ignore
        }

        throw new Error(
          `Klaviyo API error: ${campaignsResponse.status}${detail ? ` - ${detail}` : ''}`
        );
      }

      const campaignsData = await campaignsResponse.json();
      const campaigns: KlaviyoCampaign[] = campaignsData.data || [];

      if (campaigns.length === 0) break;

      // Fetch campaign messages for each campaign
      for (const campaign of campaigns) {
        if (totalFetched >= maxCampaigns) break;

        try {
          const messagesUrl = `https://a.klaviyo.com/api/campaigns/${campaign.id}/campaign-messages`;
          const messagesResponse = await fetch(messagesUrl, {
            headers: {
              'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
              'revision': '2024-10-15',
              'Accept': 'application/json',
            },
          });

          if (messagesResponse.ok) {
            messagesFetchedOk++;
            const messagesData = await messagesResponse.json();
            const messages: KlaviyoCampaignMessage[] = messagesData.data || [];

            for (const message of messages) {
              // Klaviyo API v2024-10-15 nests subject/preview under content
              const subject = message.attributes?.content?.subject ?? message.attributes?.subject;
              const preview = message.attributes?.content?.preview_text ?? message.attributes?.preview_text;

              if (subject && subject.trim() && !subjectLines.includes(subject.trim())) {
                subjectLines.push(subject.trim());
              }
              if (preview && preview.trim() && !previewTexts.includes(preview.trim())) {
                previewTexts.push(preview.trim());
              }
            }
          } else {
            messagesFailed++;
            const errText = await messagesResponse.text().catch(() => '');
            console.error(`Messages API error for campaign ${campaign.id}: ${messagesResponse.status} - ${errText.slice(0, 200)}`);
          }
        } catch (err) {
          messagesFailed++;
          console.error(`Error fetching messages for campaign ${campaign.id}:`, err);
        }

        totalFetched++;
      }

      // Check for next page
      nextCursor = campaignsData.links?.next 
        ? new URL(campaignsData.links.next).searchParams.get('page[cursor]')
        : null;

      if (!nextCursor) break;
    }

    console.log(`Scraped ${subjectLines.length} subject lines, ${previewTexts.length} preview texts from ${totalFetched} campaigns (messages OK: ${messagesFetchedOk}, failed: ${messagesFailed})`);

    // Update brand in database
    const copyExamples = {
      subjectLines,
      previewTexts,
      lastScraped: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('brands')
      .update({ copy_examples: copyExamples })
      .eq('id', brandId);

    if (updateError) {
      console.error('Error updating brand:', updateError);
      throw updateError;
    }

    return jsonResponse(req, {
      success: true,
      subjectLinesCount: subjectLines.length,
      previewTextsCount: previewTexts.length,
      campaignsScanned: totalFetched,
      messagesFetchedOk,
      messagesFailed,
      sampleSubjectLines: subjectLines.slice(0, 5),
    });

  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return jsonResponse(req, { error: error.message }, error.status);
    }
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
