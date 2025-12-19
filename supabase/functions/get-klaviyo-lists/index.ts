import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Retry on 502, 503, 504 (transient gateway errors)
      if (response.status >= 502 && response.status <= 504 && attempt < maxRetries) {
        console.log(`Klaviyo API returned ${response.status}, retrying (attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`Fetch attempt ${attempt} failed:`, lastError.message);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

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

    console.log('Fetching all Klaviyo segments with pagination...');

    // Fetch ALL segments using cursor-based pagination
    let allSegments: Array<{ id: string; name: string }> = [];
    let nextCursor: string | null = null;
    let pageCount = 0;

    do {
      pageCount++;
      const url = new URL('https://a.klaviyo.com/api/segments');
      url.searchParams.set('page[size]', '100'); // Max page size
      if (nextCursor) {
        url.searchParams.set('page[cursor]', nextCursor);
      }

      console.log(`Fetching page ${pageCount}...`);

      const response = await fetchWithRetry(url.toString(), {
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

        // If Klaviyo is temporarily down (Cloudflare 5xx), don't bubble a 5xx to the client.
        if (response.status >= 502 && response.status <= 504) {
          return new Response(
            JSON.stringify({
              lists: allSegments, // Return what we have so far
              transientError: true,
              error: `Klaviyo temporarily unavailable (${response.status}). Partial results returned.`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: `Klaviyo API error: ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();

      // Add segments from this page
      const pageSegments = data.data?.map((segment: any) => ({
        id: segment.id,
        name: segment.attributes?.name || 'Unnamed Segment',
      })) || [];

      allSegments = [...allSegments, ...pageSegments];
      console.log(`Page ${pageCount}: fetched ${pageSegments.length} segments (total: ${allSegments.length})`);

      // Get next page cursor from links.next URL
      if (data.links?.next) {
        try {
          const nextUrl = new URL(data.links.next);
          nextCursor = nextUrl.searchParams.get('page[cursor]');
        } catch {
          nextCursor = null;
        }
      } else {
        nextCursor = null;
      }

    } while (nextCursor);

    console.log(`Finished fetching all segments: ${allSegments.length} total across ${pageCount} pages`);

    return new Response(
      JSON.stringify({ lists: allSegments }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching Klaviyo lists:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch lists';

    // Return a 200 so the client can handle transient failures without crashing.
    return new Response(
      JSON.stringify({
        lists: [],
        transientError: true,
        error: errorMessage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
