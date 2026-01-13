import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FrameData {
  name: string;
  width: number;
  height: number;
  imageBase64: string; // Raw base64 or data URL
}

interface IngestPayload {
  pluginToken: string;
  frames: FrameData[];
  subjectLine?: string;
  previewText?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: IngestPayload = await req.json();
    const { pluginToken, frames, subjectLine, previewText } = payload;

    console.log('[figma-ingest] Received request with', frames?.length || 0, 'frames');

    // 1. Validate plugin token
    if (!pluginToken) {
      return new Response(
        JSON.stringify({ error: 'Plugin token is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Look up token to get user_id
    const { data: tokenData, error: tokenError } = await supabase
      .from('plugin_tokens')
      .select('user_id')
      .eq('token', pluginToken)
      .single();

    if (tokenError || !tokenData) {
      console.error('[figma-ingest] Invalid token:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid plugin token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = tokenData.user_id;
    console.log('[figma-ingest] Token valid for user:', userId);

    // 3. Update last_used_at on the token
    await supabase
      .from('plugin_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', pluginToken);

    // 4. Validate frames
    if (!frames || frames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one frame is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Process each frame
    const campaignIds: string[] = [];
    const errors: Array<{ frame: string; error: string }> = [];

    for (const frame of frames) {
      try {
        // Validate frame has image data
        if (!frame.imageBase64) {
          errors.push({ frame: frame.name, error: 'Missing image data' });
          continue;
        }

        // Normalize base64 - add prefix if not present
        const imageData = frame.imageBase64.startsWith('data:') 
          ? frame.imageBase64 
          : `data:image/png;base64,${frame.imageBase64}`;

        console.log('[figma-ingest] Uploading frame:', frame.name);

        // Upload image to Cloudinary
        const uploadUrl = `${supabaseUrl}/functions/v1/upload-to-cloudinary`;
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            imageData,
            folder: 'campaign-queue'
          })
        });

        if (!uploadResponse.ok) {
          const errText = await uploadResponse.text();
          console.error('[figma-ingest] Cloudinary upload failed:', errText);
          errors.push({ frame: frame.name, error: 'Failed to upload image' });
          continue;
        }

        const uploadData = await uploadResponse.json();
        const imageUrl = uploadData.url || uploadData.secure_url;

        if (!imageUrl) {
          errors.push({ frame: frame.name, error: 'No image URL returned from upload' });
          continue;
        }

        console.log('[figma-ingest] Image uploaded:', imageUrl);

        // Create campaign queue entry
        const { data: campaign, error: campaignError } = await supabase
          .from('campaign_queue')
          .insert({
            user_id: userId,
            source: 'figma',
            source_metadata: {
              frameName: frame.name,
              width: frame.width,
              height: frame.height
            },
            name: frame.name,
            image_url: imageUrl,
            image_width: frame.width,
            image_height: frame.height,
            provided_subject_line: subjectLine || null,
            provided_preview_text: previewText || null,
            status: 'processing',
            processing_step: 'queued',
            processing_percent: 0
          })
          .select('id')
          .single();

        if (campaignError || !campaign) {
          console.error('[figma-ingest] Failed to create campaign:', campaignError);
          errors.push({ frame: frame.name, error: 'Failed to create campaign' });
          continue;
        }

        campaignIds.push(campaign.id);
        console.log('[figma-ingest] Created campaign:', campaign.id);

        // Trigger async processing (fire and forget)
        fetch(`${supabaseUrl}/functions/v1/process-campaign-queue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ campaignQueueId: campaign.id })
        }).catch(err => {
          console.error(`[figma-ingest] Failed to trigger processing for ${campaign.id}:`, err);
        });

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[figma-ingest] Frame processing error:', message);
        errors.push({ frame: frame.name, error: message });
      }
    }

    console.log('[figma-ingest] Created', campaignIds.length, 'campaigns');

    // 6. Return response
    return new Response(
      JSON.stringify({
        success: campaignIds.length > 0,
        campaignIds,
        errors: errors.length > 0 ? errors : null
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[figma-ingest] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
