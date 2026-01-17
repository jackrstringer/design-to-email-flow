import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { klaviyoApiKey, segmentIds } = await req.json();

    if (!klaviyoApiKey) {
      console.error('Missing Klaviyo API key');
      return new Response(
        JSON.stringify({ error: 'Missing Klaviyo API key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!segmentIds || !Array.isArray(segmentIds) || segmentIds.length === 0) {
      console.log('No segment IDs provided, returning 0');
      return new Response(
        JSON.stringify({ totalSize: 0, segments: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching sizes for ${segmentIds.length} segments`);

    // Fetch profile count for each segment
    const segmentSizes: { id: string; name: string; size: number }[] = [];
    
    for (const segmentId of segmentIds) {
      try {
        // Get segment details including profile count
        const response = await fetch(
          `https://a.klaviyo.com/api/segments/${segmentId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
              'revision': '2024-02-15',
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          console.error(`Failed to fetch segment ${segmentId}: ${response.status}`);
          segmentSizes.push({ id: segmentId, name: 'Unknown', size: 0 });
          continue;
        }

        const data = await response.json();
        const segment = data.data;
        
        // Profile count is in attributes.profile_count
        const profileCount = segment?.attributes?.profile_count || 0;
        const name = segment?.attributes?.name || 'Unknown';
        
        console.log(`Segment ${segmentId} (${name}): ${profileCount} profiles`);
        segmentSizes.push({ id: segmentId, name, size: profileCount });
      } catch (error) {
        console.error(`Error fetching segment ${segmentId}:`, error);
        segmentSizes.push({ id: segmentId, name: 'Unknown', size: 0 });
      }
    }

    // Calculate total (note: this is a simple sum, actual overlap would require more complex logic)
    const totalSize = segmentSizes.reduce((sum, seg) => sum + seg.size, 0);

    console.log(`Total segment size: ${totalSize}`);

    return new Response(
      JSON.stringify({ totalSize, segments: segmentSizes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-segment-size:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
