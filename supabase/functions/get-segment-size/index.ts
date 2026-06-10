// deploy-trigger
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, requireBrandAccess, serviceClient, AuthError } from "../_shared/auth.ts";
import { getBrandSecret } from "../_shared/secrets.ts";
import { newTrace, sanitizeError } from "../_shared/log.ts";

serve(async (req) => {
  // Handle CORS preflight
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const ctx = newTrace('get-segment-size', req);

  try {
    const auth = await requireAuth(req);
    const { brandId, klaviyoApiKey: legacyKey, segmentIds } = await req.json();

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

    if (!segmentIds || !Array.isArray(segmentIds) || segmentIds.length === 0) {
      console.log('No segment IDs provided, returning 0');
      return jsonResponse(req, { totalSize: 0, segments: [] });
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

    return jsonResponse(req, { totalSize, segments: segmentSizes });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(req, { error: error.message }, error.status);
    }
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
