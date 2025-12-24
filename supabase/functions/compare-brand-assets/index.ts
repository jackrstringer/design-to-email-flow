import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedAsset {
  id: string;
  description: string;
  location: string;
  category: 'logo' | 'decorative' | 'background' | 'other';
  is_standard_character?: boolean;
}

interface BrandLibrary {
  darkLogoUrl?: string;
  lightLogoUrl?: string;
  footerLogoUrl?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      extractedAssets, 
      brandLibrary,
      referenceImageUrl 
    }: { 
      extractedAssets: ExtractedAsset[]; 
      brandLibrary: BrandLibrary;
      referenceImageUrl: string;
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log('Comparing assets:', { 
      extractedCount: extractedAssets?.length || 0,
      hasLibrary: !!brandLibrary,
      hasDarkLogo: !!brandLibrary?.darkLogoUrl,
      hasLightLogo: !!brandLibrary?.lightLogoUrl
    });

    // If no extracted assets, nothing to compare
    if (!extractedAssets || extractedAssets.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        use_from_library: [],
        needs_confirmation: [],
        needs_upload: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Separate standard character assets (no upload needed) from real assets
    const standardCharacterAssets = extractedAssets.filter(a => a.is_standard_character);
    const realAssets = extractedAssets.filter(a => !a.is_standard_character);

    // If we have library assets to compare against, use vision to compare
    const libraryUrls: string[] = [];
    if (brandLibrary?.darkLogoUrl) libraryUrls.push(brandLibrary.darkLogoUrl);
    if (brandLibrary?.lightLogoUrl) libraryUrls.push(brandLibrary.lightLogoUrl);
    if (brandLibrary?.footerLogoUrl) libraryUrls.push(brandLibrary.footerLogoUrl);

    // If no library assets and no real assets to upload, return early
    if (libraryUrls.length === 0 && realAssets.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        use_from_library: [],
        needs_confirmation: [],
        needs_upload: [],
        use_text_fallback: standardCharacterAssets.map(a => ({
          id: a.id,
          description: a.description,
          fallback_character: '→' // Default, could be smarter
        }))
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build prompt for visual comparison
    const assetList = realAssets.map(a => 
      `- ${a.id}: ${a.description} (${a.location})`
    ).join('\n');

    const libraryList = [];
    if (brandLibrary?.darkLogoUrl) libraryList.push('- Dark logo (for light backgrounds)');
    if (brandLibrary?.lightLogoUrl) libraryList.push('- Light logo (for dark backgrounds)');
    if (brandLibrary?.footerLogoUrl) libraryList.push('- Footer-specific logo');

    const prompt = `Compare the assets identified in the reference design against the brand's existing library assets.

ASSETS IDENTIFIED IN REFERENCE DESIGN:
${assetList || '(none)'}

BRAND LIBRARY CONTAINS:
${libraryList.join('\n') || '(no logos in library)'}

For each identified asset, determine:
1. MATCH - A library asset visually matches and can be used directly
2. SIMILAR_BUT_DIFFERENT - Library has something related but visually different (e.g., text wordmark vs icon logo)
3. NEEDS_UPLOAD - No matching or similar asset in library, user must upload

Return ONLY valid JSON:
{
  "comparisons": [
    {
      "asset_id": "the_asset_id",
      "status": "match" | "similar_but_different" | "needs_upload",
      "library_match": "dark_logo" | "light_logo" | "footer_logo" | null,
      "reason": "Brief explanation of the comparison result"
    }
  ]
}`;

    // Build content array with images
    const content: any[] = [
      {
        type: 'image',
        source: { type: 'url', url: referenceImageUrl }
      }
    ];

    // Add library images for comparison
    for (const url of libraryUrls) {
      content.push({
        type: 'image',
        source: { type: 'url', url }
      });
    }

    content.push({
      type: 'text',
      text: prompt
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.content?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', responseText);
      throw new Error('Failed to extract JSON from AI response');
    }

    const comparisonResult = JSON.parse(jsonMatch[0]);
    
    // Process results into categories
    const useFromLibrary: any[] = [];
    const needsConfirmation: any[] = [];
    const needsUpload: any[] = [];

    for (const comparison of comparisonResult.comparisons || []) {
      const asset = realAssets.find(a => a.id === comparison.asset_id);
      if (!asset) continue;

      if (comparison.status === 'match') {
        let libraryUrl = '';
        if (comparison.library_match === 'dark_logo') libraryUrl = brandLibrary?.darkLogoUrl || '';
        else if (comparison.library_match === 'light_logo') libraryUrl = brandLibrary?.lightLogoUrl || '';
        else if (comparison.library_match === 'footer_logo') libraryUrl = brandLibrary?.footerLogoUrl || '';
        
        useFromLibrary.push({
          id: asset.id,
          description: asset.description,
          library_url: libraryUrl
        });
      } else if (comparison.status === 'similar_but_different') {
        let libraryUrl = '';
        if (comparison.library_match === 'dark_logo') libraryUrl = brandLibrary?.darkLogoUrl || '';
        else if (comparison.library_match === 'light_logo') libraryUrl = brandLibrary?.lightLogoUrl || '';
        else if (comparison.library_match === 'footer_logo') libraryUrl = brandLibrary?.footerLogoUrl || '';

        needsConfirmation.push({
          id: asset.id,
          description: asset.description,
          reason: comparison.reason,
          library_url: libraryUrl
        });
      } else {
        needsUpload.push({
          id: asset.id,
          description: asset.description,
          category: asset.category
        });
      }
    }

    // Add standard character fallbacks
    const useTextFallback = standardCharacterAssets.map(a => ({
      id: a.id,
      description: a.description,
      fallback_character: '→'
    }));

    console.log('Comparison results:', {
      useFromLibrary: useFromLibrary.length,
      needsConfirmation: needsConfirmation.length,
      needsUpload: needsUpload.length,
      useTextFallback: useTextFallback.length
    });

    return new Response(JSON.stringify({ 
      success: true,
      use_from_library: useFromLibrary,
      needs_confirmation: needsConfirmation,
      needs_upload: needsUpload,
      use_text_fallback: useTextFallback
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Compare brand assets error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
