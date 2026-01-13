import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FigmaFrame {
  fileKey: string;
  nodeId: string;
  name: string;
  pageName?: string;
  width: number;
  height: number;
}

interface IngestRequest {
  frames: FigmaFrame[];
  pluginToken: string;
  subjectLine?: string;
  previewText?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: IngestRequest = await req.json();
    const { frames, pluginToken, subjectLine, previewText } = body;

    console.log('[figma-ingest] Received request with', frames?.length || 0, 'frames');

    // Validate input
    if (!pluginToken) {
      return new Response(
        JSON.stringify({ error: 'Plugin token is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one frame is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate plugin token and get user_id
    console.log('[figma-ingest] Validating plugin token...');
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

    // Update last_used_at for the token
    await supabase
      .from('plugin_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', pluginToken);

    // Get user's Figma access token from profiles
    const { data: profileData } = await supabase
      .from('profiles')
      .select('figma_access_token')
      .eq('id', userId)
      .single();

    const figmaToken = profileData?.figma_access_token;
    console.log('[figma-ingest] User has Figma token:', !!figmaToken);

    // Create campaign queue entries for each frame
    const createdIds: string[] = [];
    const errors: Array<{ frame: string; error: string }> = [];

    for (const frame of frames) {
      const sourceUrl = `https://www.figma.com/file/${frame.fileKey}?node-id=${encodeURIComponent(frame.nodeId)}`;
      
      const queueItem = {
        user_id: userId,
        source: 'figma',
        source_url: sourceUrl,
        source_metadata: {
          fileKey: frame.fileKey,
          nodeId: frame.nodeId,
          pageName: frame.pageName || null,
          frameName: frame.name,
          width: frame.width,
          height: frame.height,
          figmaToken: figmaToken || null // Pass token for processing
        },
        name: frame.name,
        image_width: frame.width,
        image_height: frame.height,
        status: 'processing',
        processing_step: 'queued',
        processing_percent: 0,
        provided_subject_line: subjectLine || null,
        provided_preview_text: previewText || null
      };

      console.log('[figma-ingest] Creating queue item for:', frame.name);

      const { data: insertedItem, error: insertError } = await supabase
        .from('campaign_queue')
        .insert(queueItem)
        .select('id')
        .single();

      if (insertError) {
        console.error('[figma-ingest] Failed to insert:', insertError);
        errors.push({ frame: frame.name, error: insertError.message });
        continue;
      }

      createdIds.push(insertedItem.id);

      // Trigger async processing (fire and forget)
      console.log('[figma-ingest] Triggering processing for:', insertedItem.id);
      
      // Fire and forget - don't await the processing
      fetch(`${supabaseUrl}/functions/v1/process-campaign-queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ campaignQueueId: insertedItem.id })
      }).catch(err => {
        console.error('[figma-ingest] Failed to trigger processing:', err);
      });
    }

    console.log('[figma-ingest] Created', createdIds.length, 'queue items');

    return new Response(
      JSON.stringify({
        success: true,
        campaignIds: createdIds,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
