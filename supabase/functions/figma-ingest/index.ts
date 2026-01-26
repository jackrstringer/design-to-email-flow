import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FrameData {
  name: string;
  width: number;        // Figma frame width (1x)
  height: number;       // Figma frame height (1x)
  exportScale?: number; // Export scale (1 or 2), defaults to 2
  imageBase64: string;  // Raw base64 or data URL
  figmaUrl?: string;    // Figma URL for ClickUp integration
}

interface IngestPayload {
  pluginToken: string;
  frames: FrameData[];
  subjectLine?: string;
  previewText?: string;
  brandId?: string; // Optional brand selection from plugin dropdown
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
    const { pluginToken, frames, subjectLine, previewText, brandId } = payload;

    console.log('[figma-ingest] Received request with', frames?.length || 0, 'frames, brandId:', brandId || 'none');

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

    // 4. Validate brand if provided
    let validBrandId: string | null = null;
    if (brandId) {
      const { data: brand, error: brandError } = await supabase
        .from('brands')
        .select('id')
        .eq('id', brandId)
        .eq('user_id', userId)
        .single();

      if (brand && !brandError) {
        validBrandId = brand.id;
        console.log('[figma-ingest] Using brand:', validBrandId);
      } else {
        console.warn('[figma-ingest] Invalid brandId provided, ignoring');
      }
    }

    // 5. Validate frames
    if (!frames || frames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one frame is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Process each frame
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

        console.log('[figma-ingest] Uploading frame:', frame.name, 'Figma URL:', frame.figmaUrl || 'none');

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
          
          // Parse error for better messaging
          let errorMessage = 'Failed to upload image';
          try {
            const errJson = JSON.parse(errText);
            if (errJson.hint) {
              errorMessage = errJson.hint;
            } else if (errText.includes('File size too large') || errText.includes('too large')) {
              errorMessage = 'Image too large (>10MB). Try exporting at 1x scale or as JPG.';
            } else if (errJson.error) {
              errorMessage = errJson.error;
            }
          } catch {
            if (errText.includes('File size too large') || errText.includes('too large')) {
              errorMessage = 'Image too large (>10MB). Try exporting at 1x scale or as JPG.';
            }
          }
          
          errors.push({ frame: frame.name, error: errorMessage });
          continue;
        }

        const uploadData = await uploadResponse.json();
        const imageUrl = uploadData.url || uploadData.secure_url;

        if (!imageUrl) {
          errors.push({ frame: frame.name, error: 'No image URL returned from upload' });
          continue;
        }

        console.log('[figma-ingest] Image uploaded:', imageUrl);

        // Calculate actual exported dimensions based on plugin's scale
        const exportScale = frame.exportScale || 2; // Default to 2 for backwards compatibility
        const actualWidth = Math.round(frame.width * exportScale);
        const actualHeight = Math.round(frame.height * exportScale);

        console.log(`[figma-ingest] Frame "${frame.name}": Figma ${frame.width}x${frame.height}, exportScale=${exportScale}, actual=${actualWidth}x${actualHeight}`);

        // Create campaign queue entry
        const { data: campaign, error: campaignError } = await supabase
          .from('campaign_queue')
          .insert({
            user_id: userId,
            brand_id: validBrandId,
            source: 'figma',
            source_url: frame.figmaUrl || null,
            source_metadata: {
              frameName: frame.name,
              figmaWidth: frame.width,    // Original Figma dimensions
              figmaHeight: frame.height,
              exportScale: exportScale     // Store for reference
            },
            name: frame.name,
            image_url: imageUrl,
            image_width: actualWidth,      // ACTUAL exported width
            image_height: actualHeight,    // ACTUAL exported height
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

    // 7. Return response
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
