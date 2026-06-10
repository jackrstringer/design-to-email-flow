import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, requireBrandAccess, serviceClient, AuthError } from "../_shared/auth.ts";
import { getBrandSecret } from "../_shared/secrets.ts";
import { newTrace, sanitizeError } from "../_shared/log.ts";

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
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const ctx = newTrace('get-klaviyo-lists', req);

  try {
    const auth = await requireAuth(req);
    const { brandId, klaviyoApiKey: legacyKey } = await req.json();

    if (!brandId) {
      // Backward compat: old clients sent the raw key. Raw keys are no longer accepted.
      if (legacyKey) {
        return jsonResponse(
          req,
          { error: 'Raw API keys are no longer accepted. Send brandId instead; the Klaviyo key is resolved server-side.' },
          400,
        );
      }
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

    console.log('Fetching all Klaviyo segments with pagination...');

    // Fetch ALL segments using cursor-based pagination
    let allSegments: Array<{ id: string; name: string }> = [];
    let nextCursor: string | null = null;
    let pageCount = 0;

    do {
      pageCount++;
      // Klaviyo Segments API doesn't support page[size], only page[cursor]
      let urlStr = 'https://a.klaviyo.com/api/segments';
      if (nextCursor) {
        urlStr += `?page%5Bcursor%5D=${encodeURIComponent(nextCursor)}`;
      }

      console.log(`Fetching page ${pageCount}...`);

      const response = await fetchWithRetry(urlStr, {
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
          return jsonResponse(req, {
            lists: allSegments, // Return what we have so far
            transientError: true,
            error: `Klaviyo temporarily unavailable (${response.status}). Partial results returned.`,
          });
        }

        return jsonResponse(req, { error: `Klaviyo API error: ${response.status}` }, response.status);
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

    return jsonResponse(req, { lists: allSegments });

  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(req, { error: error.message }, error.status);
    }
    // Return a 200 so the client can handle transient failures without crashing.
    return jsonResponse(req, {
      lists: [],
      transientError: true,
      error: sanitizeError(ctx, error),
    });
  }
});
