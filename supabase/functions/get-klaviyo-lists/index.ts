import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { klaviyoApiKey } = await req.json();

    if (!klaviyoApiKey) {
      return new Response(
        JSON.stringify({ error: 'Klaviyo API key is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching Klaviyo lists...');

    // Fetch lists from Klaviyo API
    const response = await fetch('https://a.klaviyo.com/api/lists', {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'accept': 'application/json',
        'revision': '2025-01-15',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Klaviyo API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Klaviyo API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Transform to simplified format
    const lists = data.data?.map((list: any) => ({
      id: list.id,
      name: list.attributes?.name || 'Unnamed List',
    })) || [];

    console.log(`Found ${lists.length} lists`);

    return new Response(
      JSON.stringify({ lists }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching Klaviyo lists:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch lists';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
