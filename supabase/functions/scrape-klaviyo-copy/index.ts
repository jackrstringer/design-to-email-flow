import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    subject: string;
    preview_text: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandId, klaviyoApiKey } = await req.json();

    if (!brandId || !klaviyoApiKey) {
      throw new Error('brandId and klaviyoApiKey are required');
    }

    console.log(`Scraping Klaviyo copy for brand ${brandId}`);

    const subjectLines: string[] = [];
    const previewTexts: string[] = [];
    let nextCursor: string | null = null;
    let totalFetched = 0;
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
            const messagesData = await messagesResponse.json();
            const messages: KlaviyoCampaignMessage[] = messagesData.data || [];

            for (const message of messages) {
              const subject = message.attributes?.subject;
              const preview = message.attributes?.preview_text;

              if (subject && subject.trim() && !subjectLines.includes(subject.trim())) {
                subjectLines.push(subject.trim());
              }
              if (preview && preview.trim() && !previewTexts.includes(preview.trim())) {
                previewTexts.push(preview.trim());
              }
            }
          }
        } catch (err) {
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

    console.log(`Scraped ${subjectLines.length} subject lines, ${previewTexts.length} preview texts from ${totalFetched} campaigns`);

    // Update brand in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    return new Response(
      JSON.stringify({
        success: true,
        subjectLinesCount: subjectLines.length,
        previewTextsCount: previewTexts.length,
        campaignsScanned: totalFetched,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in scrape-klaviyo-copy:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
