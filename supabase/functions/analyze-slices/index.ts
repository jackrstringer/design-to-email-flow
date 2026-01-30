import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceInput {
  dataUrl?: string;
  imageUrl?: string;
  index: number;
  column?: number;
  totalColumns?: number;
  rowIndex?: number;
}

interface CampaignContext {
  campaign_type: 'product_launch' | 'collection_highlight' | 'sale_promo' | 'brand_general';
  primary_focus: string;
  detected_products: string[];
  detected_collections: string[];
}

interface SliceDescription {
  index: number;
  altText: string;
  isClickable: boolean;
  isGenericCta: boolean;
  description: string;
}

interface SliceAnalysis {
  index: number;
  altText: string;
  suggestedLink: string | null;
  isClickable: boolean;
  linkVerified: boolean;
  linkSource?: string;
  linkWarning?: string;
  multiCtaWarning?: string;
}

interface MatchResult {
  url: string | null;
  source: string;
  confidence: number;
  link_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slices, brandUrl, brandDomain, brandId, fullCampaignImage, knownProductUrls } = await req.json() as { 
      slices: SliceInput[]; 
      brandUrl?: string;
      brandDomain?: string;
      brandId?: string;
      fullCampaignImage?: string;
      knownProductUrls?: Array<{ name: string; url: string }>;
    };

    if (!slices || !Array.isArray(slices) || slices.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid slices array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const domain = brandDomain || (brandUrl ? new URL(brandUrl).hostname.replace('www.', '') : null);

    // [DIAGNOSTIC] Log 1: Function entry
    console.log('[analyze-slices] Starting', {
      brandId: brandId || 'none',
      sliceCount: slices.length,
      hasBrandId: !!brandId,
      brandDomain: domain
    });

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if brand has indexed links
    let hasLinkIndex = false;
    let linkPreferences: { default_destination_url?: string; product_churn?: string; rules?: Array<{ name: string; destination_url: string }> } | null = null;
    
    if (brandId) {
      const { data: brand } = await supabase
        .from('brands')
        .select('link_preferences')
        .eq('id', brandId)
        .single();
      
      linkPreferences = brand?.link_preferences || null;
      
      const { count } = await supabase
        .from('brand_link_index')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brandId)
        .eq('is_healthy', true);
      
      hasLinkIndex = (count || 0) > 0;
      
      // [DIAGNOSTIC] Log 2: Link index check
      console.log('[analyze-slices] Link index check', {
        brandId,
        hasLinkIndex,
        linkCount: count || 0,
        hasPreferences: !!linkPreferences,
        defaultUrl: linkPreferences?.default_destination_url || 'none',
        ruleCount: linkPreferences?.rules?.length || 0,
        usingIndexPath: hasLinkIndex && Boolean(brandId)
      });
    }

    // PHASE 1: Campaign Context Analysis (if we have indexed links)
    let campaignContext: CampaignContext | null = null;
    
    if (hasLinkIndex && fullCampaignImage) {
      console.log('Phase 1: Analyzing campaign context...');
      campaignContext = await analyzeCampaignContext(fullCampaignImage, ANTHROPIC_API_KEY);
      
      // [DIAGNOSTIC] Log 3: Campaign context
      console.log('[analyze-slices] Campaign context', {
        campaign_type: campaignContext?.campaign_type,
        primary_focus: campaignContext?.primary_focus,
        detected_products: campaignContext?.detected_products?.length || 0,
        detected_collections: campaignContext?.detected_collections?.length || 0
      });
    }

    // PHASE 2: Get slice descriptions from Claude
    console.log('Phase 2: Getting slice descriptions...');
    
    // Build the prompt based on whether we're using index-first or web-search
    const useIndexMatching = hasLinkIndex && Boolean(brandId);
    const sliceDescriptions = await getSliceDescriptions(
      slices, 
      fullCampaignImage, 
      campaignContext,
      domain,
      knownProductUrls,
      useIndexMatching,
      ANTHROPIC_API_KEY
    );

    // [DIAGNOSTIC] Log 4: Slice descriptions received
    console.log('[analyze-slices] Slice descriptions received');
    sliceDescriptions.forEach((slice, i) => {
      console.log(`[analyze-slices] Slice ${i}`, {
        isClickable: slice.isClickable,
        isGenericCta: slice.isGenericCta,
        description: slice.description?.substring(0, 80),
        altText: slice.altText?.substring(0, 50)
      });
    });

    // PHASE 3: Match slices to links
    console.log('Phase 3: Matching slices to links...');
    
    let analyses: SliceAnalysis[];
    
    if (useIndexMatching) {
      // Index-first matching
      analyses = await matchSlicesViaIndex(
        sliceDescriptions,
        brandId!,
        campaignContext,
        linkPreferences,
        domain,
        supabaseUrl,
        supabaseKey
      );
    } else {
      // Legacy web-search matching (for brands without indexed links)
      analyses = await matchSlicesViaWebSearch(
        slices,
        sliceDescriptions,
        fullCampaignImage,
        domain,
        brandUrl,
        knownProductUrls,
        ANTHROPIC_API_KEY
      );
    }

    // Extract discovered URLs for reactive indexing
    const discoveredUrls: Array<{ productName: string; url: string }> = [];

    // [DIAGNOSTIC] Log 5: Link matching complete
    console.log('[analyze-slices] Link matching complete', {
      slicesWithLinks: analyses.filter(r => r.suggestedLink).length,
      slicesWithoutLinks: analyses.filter(r => !r.suggestedLink).length,
      clickableWithoutLinks: analyses.filter(r => r.isClickable && !r.suggestedLink).length,
      linkSources: analyses.map(r => r.linkSource)
    });

    return new Response(
      JSON.stringify({ analyses, discoveredUrls }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in analyze-slices:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Phase 1: Analyze the full campaign image to understand context
 */
async function analyzeCampaignContext(
  fullCampaignImage: string,
  apiKey: string
): Promise<CampaignContext> {
  const prompt = `Analyze this email campaign image and tell me:

1. What type of campaign is this?
   - product_launch (featuring a specific new product)
   - collection_highlight (featuring a collection or category)
   - sale_promo (promotional/discount focused)
   - brand_general (general brand awareness, no specific product focus)

2. What is the primary focus? (e.g., "Summer Tote Collection", "New Protein Formula", "Holiday Sale")

3. List any specific products or collections you can identify in the email.

Respond ONLY in JSON:
{
  "campaign_type": "product_launch" | "collection_highlight" | "sale_promo" | "brand_general",
  "primary_focus": "string describing main subject",
  "detected_products": ["product 1", "product 2"],
  "detected_collections": ["collection 1"]
}`;

  const content: Array<{ type: string; text?: string; source?: { type: string; media_type?: string; data?: string; url?: string } }> = [
    { type: 'text', text: prompt }
  ];

  // Add the campaign image
  if (fullCampaignImage.startsWith('http')) {
    content.push({
      type: 'image',
      source: { type: 'url', url: fullCampaignImage }
    });
  } else {
    const matches = fullCampaignImage.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: matches[1], data: matches[2] }
      });
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022', // Fast model for context analysis
        max_tokens: 500,
        messages: [{ role: 'user', content }]
      }),
    });

    if (!response.ok) {
      console.error('Campaign context API error:', response.status);
      return getDefaultCampaignContext();
    }

    const aiResponse = await response.json();
    const textContent = aiResponse.content?.find((c: { type: string }) => c.type === 'text')?.text || '';
    
    // Parse JSON from response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Error analyzing campaign context:', error);
  }

  return getDefaultCampaignContext();
}

function getDefaultCampaignContext(): CampaignContext {
  return {
    campaign_type: 'brand_general',
    primary_focus: '',
    detected_products: [],
    detected_collections: []
  };
}

/**
 * Phase 2: Get descriptions for each slice
 */
async function getSliceDescriptions(
  slices: SliceInput[],
  fullCampaignImage: string | undefined,
  campaignContext: CampaignContext | null,
  domain: string | null,
  knownProductUrls: Array<{ name: string; url: string }> | undefined,
  useIndexMatching: boolean,
  apiKey: string
): Promise<SliceDescription[]> {
  
  // Build prompt based on matching strategy
  let prompt: string;
  
  if (useIndexMatching) {
    // Simplified prompt - no web search, just describe what you see
    prompt = `Analyze these email campaign slices.

${fullCampaignImage ? 'FIRST IMAGE: Full campaign overview (REFERENCE ONLY - DO NOT include in your output).' : ''}
${campaignContext ? `Campaign context: ${campaignContext.campaign_type} - "${campaignContext.primary_focus}"` : ''}

For each labeled slice, provide:

1. **altText** (max 200 chars): Capture the marketing message. Include visible text.

2. **isClickable**: true/false
   - YES: Header logos, product images, CTAs, hero sections with buttons
   - NO: Text-only sections without CTAs, dividers, spacers, legal text

3. **isGenericCta**: true if the slice is a generic call-to-action like "Shop Now", "Learn More", "Shop [Brand]", "Discover", "Get Yours" - buttons that don't show a specific product name

4. **description**: Brief description of what's shown (for product matching). Be specific about product names, collection names, or what the CTA refers to.

IMPORTANT: Each slice is labeled "=== SLICE N (index: X) ===" before its image.
Your output MUST have exactly ${slices.length} entries, with indices 0 to ${slices.length - 1}.

Return JSON:
{
  "slices": [
    { "index": 0, "altText": "...", "isClickable": true/false, "isGenericCta": true/false, "description": "..." },
    ...
  ]
}`;
  } else {
    // Full prompt with web search instructions (legacy behavior)
    const knownUrlsContext = knownProductUrls && knownProductUrls.length > 0
      ? `\n\nKNOWN PRODUCT URLs (use these FIRST before searching):
${knownProductUrls.map(u => `- "${u.name}" → ${u.url}`).join('\n')}`
      : '';

    prompt = `Analyze these email campaign slices.

${fullCampaignImage ? 'FIRST IMAGE: Full campaign overview (REFERENCE ONLY).' : ''}

Brand: ${domain || 'Unknown'}${knownUrlsContext}

For each labeled slice:

**ALT TEXT** (max 200 chars) - Capture the marketing message:
- If there's a headline, offer text, body copy visible -> capture the key message
- ONLY include "Click to shop" when there is a VISIBLE CTA BUTTON

**CLICKABLE** - Be selective:
SHOULD be clickable: Header logos, CTA buttons, product images, hero sections with CTAs
Should NOT be clickable: Text-only sections without CTAs, dividers, spacers, legal text

**LINKS** - Find the real page:
- Header logos -> brand homepage: https://${domain}/
- Single product -> find actual product page (must contain /products/)
- Multiple products/general CTA -> find appropriate collection

**LINK SELECTION - Prefer evergreen URLs:**
✅ PREFER: /products/[name], /collections/new-arrivals, /collections/[category]
❌ REJECT: URLs with discounts, promo codes, campaign-specific paths

Return JSON with exactly ${slices.length} slices:
{
  "slices": [
    { "index": 0, "altText": "...", "isClickable": true/false, "suggestedLink": "https://..." or null, "linkVerified": true/false },
    ...
  ],
  "discoveredUrls": [
    { "productName": "...", "url": "..." }
  ]
}`;
  }

  // Build content array with images
  const content: Array<{ type: string; text?: string; source?: { type: string; media_type?: string; data?: string; url?: string } }> = [
    { type: 'text', text: prompt }
  ];

  // Add full campaign image for context
  if (fullCampaignImage) {
    content.push({ type: 'text', text: '=== REFERENCE IMAGE (DO NOT ANALYZE) ===' });
    if (fullCampaignImage.startsWith('http')) {
      content.push({ type: 'image', source: { type: 'url', url: fullCampaignImage } });
    } else {
      const matches = fullCampaignImage.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        content.push({ type: 'image', source: { type: 'base64', media_type: matches[1], data: matches[2] } });
      }
    }
  }

  // Add each slice image
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    let columnContext = '';
    if (slice.totalColumns && slice.totalColumns > 1) {
      columnContext = ` | COLUMN ${(slice.column ?? 0) + 1} of ${slice.totalColumns}`;
    }
    
    content.push({ type: 'text', text: `=== SLICE ${i + 1} (index: ${i})${columnContext} ===` });
    
    if (slice.imageUrl && !slice.dataUrl) {
      content.push({ type: 'image', source: { type: 'url', url: slice.imageUrl } });
    } else if (slice.dataUrl) {
      const matches = slice.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        content.push({ type: 'image', source: { type: 'base64', media_type: matches[1], data: matches[2] } });
      }
    }
  }

  // Build tools array for legacy web search mode
  const tools: Array<{ type: string; name: string; max_uses: number; allowed_domains?: string[] }> = [];
  const betaHeaders: string[] = [];
  
  if (!useIndexMatching && domain) {
    tools.push(
      { type: 'web_search_20250305', name: 'web_search', max_uses: 50 },
      { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 10, allowed_domains: [domain, `www.${domain}`] }
    );
    betaHeaders.push('web-search-2025-03-05', 'web-fetch-2025-09-10');
  }

  const requestBody: { model: string; max_tokens: number; messages: Array<{ role: string; content: typeof content }>; tools?: typeof tools } = {
    model: useIndexMatching ? 'claude-3-5-haiku-20241022' : 'claude-sonnet-4-5', // Faster model for index matching
    max_tokens: useIndexMatching ? 3000 : 6000,
    messages: [{ role: 'user', content }]
  };
  
  if (tools.length > 0) {
    requestBody.tools = tools;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  
  if (betaHeaders.length > 0) {
    headers['anthropic-beta'] = betaHeaders.join(',');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Slice description API error:', response.status, errorText);
    return slices.map((_, i) => ({
      index: i,
      altText: '',
      isClickable: false,
      isGenericCta: false,
      description: ''
    }));
  }

  const aiResponse = await response.json();
  
  // Parse response
  let allTextContent = '';
  if (aiResponse.content && Array.isArray(aiResponse.content)) {
    const textBlocks = aiResponse.content.filter((block: { type: string }) => block.type === 'text');
    allTextContent = textBlocks.map((block: { text?: string }) => block.text || '').join('\n');
  }

  // Extract JSON
  const codeBlockMatch = allTextContent.match(/```json\s*([\s\S]*?)```/);
  const rawJsonMatch = allTextContent.match(/\{\s*"slices"\s*:\s*\[[\s\S]*?\]\s*\}/);
  const jsonStr = codeBlockMatch?.[1] || rawJsonMatch?.[0];

  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      return (parsed.slices || []).map((s: SliceDescription & { suggestedLink?: string; linkVerified?: boolean }, i: number) => ({
        index: typeof s.index === 'number' ? s.index : i,
        altText: s.altText || '',
        isClickable: s.isClickable ?? false,
        isGenericCta: s.isGenericCta ?? false,
        description: s.description || s.altText || '',
        // Preserve suggestedLink and linkVerified for legacy web search mode
        suggestedLink: s.suggestedLink,
        linkVerified: s.linkVerified
      }));
    } catch (e) {
      console.error('Failed to parse slice descriptions:', e);
    }
  }

  return slices.map((_, i) => ({
    index: i,
    altText: '',
    isClickable: false,
    isGenericCta: false,
    description: ''
  }));
}

/**
 * Phase 3a: Match slices using the brand's link index
 */
async function matchSlicesViaIndex(
  sliceDescriptions: SliceDescription[],
  brandId: string,
  campaignContext: CampaignContext | null,
  linkPreferences: { default_destination_url?: string; product_churn?: string; rules?: Array<{ name: string; destination_url: string }> } | null,
  domain: string | null,
  supabaseUrl: string,
  supabaseKey: string
): Promise<SliceAnalysis[]> {
  
  const analyses: SliceAnalysis[] = [];
  
  for (const slice of sliceDescriptions) {
    if (!slice.isClickable) {
      analyses.push({
        index: slice.index,
        altText: slice.altText,
        suggestedLink: null,
        isClickable: false,
        linkVerified: false,
        linkSource: 'not_clickable'
      });
      continue;
    }

    // Call match-slice-to-link function
    try {
      const matchResponse = await fetch(`${supabaseUrl}/functions/v1/match-slice-to-link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brand_id: brandId,
          slice_description: slice.description,
          campaign_context: campaignContext || getDefaultCampaignContext(),
          is_generic_cta: slice.isGenericCta
        }),
      });

      if (matchResponse.ok) {
        const matchResult: MatchResult = await matchResponse.json();
        
        analyses.push({
          index: slice.index,
          altText: slice.altText,
          suggestedLink: matchResult.url,
          isClickable: true,
          linkVerified: matchResult.confidence > 0.8,
          linkSource: matchResult.source
        });
        
        console.log(`Slice ${slice.index}: ${matchResult.source} (${matchResult.url || 'no match'})`);
      } else {
        console.error(`match-slice-to-link error for slice ${slice.index}:`, await matchResponse.text());
        analyses.push({
          index: slice.index,
          altText: slice.altText,
          suggestedLink: null,
          isClickable: true,
          linkVerified: false,
          linkSource: 'error'
        });
      }
    } catch (error) {
      console.error(`Error matching slice ${slice.index}:`, error);
      analyses.push({
        index: slice.index,
        altText: slice.altText,
        suggestedLink: null,
        isClickable: true,
        linkVerified: false,
        linkSource: 'error'
      });
    }
  }

  // Handle web search fallback for high-churn brands
  if (linkPreferences?.product_churn === 'high') {
    const unmatchedSlices = analyses.filter(a => a.isClickable && !a.suggestedLink);
    if (unmatchedSlices.length > 0) {
      console.log(`${unmatchedSlices.length} unmatched slices for high-churn brand - would fall back to web search`);
      // TODO: Implement web search fallback and reactive indexing
    }
  }

  return analyses;
}

/**
 * Phase 3b: Legacy web-search matching (for brands without indexed links)
 */
async function matchSlicesViaWebSearch(
  slices: SliceInput[],
  sliceDescriptions: SliceDescription[],
  fullCampaignImage: string | undefined,
  domain: string | null,
  brandUrl: string | undefined,
  knownProductUrls: Array<{ name: string; url: string }> | undefined,
  apiKey: string
): Promise<SliceAnalysis[]> {
  // Legacy behavior - the web search prompt in getSliceDescriptions asks for suggestedLink directly
  // We need to extract it from the parsed response (sliceDescriptions may have suggestedLink attached)
  
  const analyses: SliceAnalysis[] = slices.map((_, i) => {
    const desc = sliceDescriptions.find(d => d.index === i) as (SliceDescription & { suggestedLink?: string; linkVerified?: boolean }) | undefined;
    return {
      index: i,
      altText: desc?.altText || '',
      suggestedLink: desc?.suggestedLink || null, // Extract from Claude response
      isClickable: desc?.isClickable ?? false,
      linkVerified: desc?.linkVerified ?? false,
      linkSource: 'web_search'
    };
  });

  return analyses;
}
