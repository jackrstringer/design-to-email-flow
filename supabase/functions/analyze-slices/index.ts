import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceInput {
  dataUrl: string;
  index: number;
  // Multi-column properties (optional)
  column?: number;
  totalColumns?: number;
  rowIndex?: number;
}

interface SliceAnalysis {
  index: number;
  altText: string;
  suggestedLink: string | null;
  isClickable: boolean;
  linkVerified: boolean;
  linkWarning?: string;
  multiCtaWarning?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slices, brandUrl, brandDomain, fullCampaignImage } = await req.json() as { 
      slices: SliceInput[]; 
      brandUrl?: string;
      brandDomain?: string;
      fullCampaignImage?: string;
    };

    if (!slices || !Array.isArray(slices) || slices.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid slices array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract domain from brandUrl if not provided
    const domain = brandDomain || (brandUrl ? new URL(brandUrl).hostname.replace('www.', '') : null);

    console.log(`Analyzing ${slices.length} slices for brand: ${brandUrl || 'unknown'}, domain: ${domain}`);
    console.log(`Full campaign image provided: ${fullCampaignImage ? 'yes' : 'no'}`);

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const prompt = `Analyze these email campaign slices.

${fullCampaignImage ? 'FIRST IMAGE: Full campaign overview (REFERENCE ONLY - DO NOT include in your output).' : ''}

IMPORTANT: Each slice to analyze is labeled "=== SLICE N (index: X) ===" before its image.
You must ONLY analyze the labeled slices. Do NOT analyze the reference image.
Your output MUST have exactly ${slices.length} entries, with indices 0 to ${slices.length - 1}.

Brand: ${domain || 'Unknown'}

For each labeled slice:

**ALT TEXT** (max 200 chars) - Capture the marketing message:
- If there's a headline, offer text, body copy visible -> capture the key message
- Include any visible text that communicates value (discounts, product benefits, urgency, etc.)

CTA TEXT RULES (CRITICAL):
- ONLY include "Click to shop" / "Click to [action]" when there is a VISIBLE CTA BUTTON in the slice
- A CTA button is a distinct rectangular/pill element with action text like "SHOP NOW", "BUY", "ORDER", "ADD TO CART"
- Product name/price text alone (like "JESSA PANT - $99") is NOT a CTA - do not add "Click to shop"
- If the slice just shows a product image with its name, describe the product without "Click to shop"
- ONLY return empty "" for slices that are PURELY decorative with ZERO text (solid color dividers, icon-only bars)

Examples:
- Product image showing "JESSA PANT" with no button -> "Jessa Pant."
- Product with visible "SHOP NOW" button -> "Jessa Pant. Click to shop now."
- Hero headline "New Arrivals" with no button -> "New Arrivals."
- Hero with "SHOP THE COLLECTION" button -> "New Arrivals. Click to shop the collection."
- Product grid with names but no buttons -> "Deep Sleep, Focus, Calming tonic."
- Solid color divider -> "" (empty)

**CLICKABLE** - Be selective, not aggressive:
SHOULD be clickable (isClickable: true):
- Header logo slices (named "header_logo" or standalone logo at the very top) → YES, always link to homepage
- ANY slice with a CTA button or "Shop" / "Buy" / "Order" text → YES
- Product images (with or without CTA) → YES
- Hero sections that contain a CTA → YES

Should NOT be clickable (isClickable: false):
- Text-only sections WITHOUT a CTA button → NO (they set up products below)
- Educational/informational copy leading into product sections → NO
- Dividers, spacers, legal/footer text → NO

Rule: If a slice is just "setting up" the products/CTAs that follow, it doesn't need its own link.

**LINKS** - Find the EXACT product page, not collections:
- For header_logo slices or standalone brand logos -> use brand homepage: https://${domain}/
- For slices showing a SPECIFIC PRODUCT (name visible like "JESSA PANT"):
  - Search: "site:${domain}/products/ [product name]" to find the direct product page
  - Product pages (/products/jessa-pant-grey) are ALWAYS preferred over collection pages
  - NEVER link a single-product slice to a collection - find the actual product URL
- For slices showing MULTIPLE products or general CTAs -> find the appropriate collection
- Use web search to verify URLs exist - search as many times as needed
- Homepage is LAST RESORT (except for header logos)

PRODUCT LINK PRIORITY:
1. /products/[exact-product-slug] - BEST (e.g., /products/jessa-pant-grey)
2. /collections/[category] - Only for multi-product slices
3. Homepage - Only if nothing else found

**LINK SELECTION PRIORITY - Evergreen URLs First:**
When web search returns multiple URL options, ALWAYS prefer stable "evergreen" paths:

✅ PREFER these patterns (EVERGREEN - stable, permanent):
- /collections/new-arrivals
- /collections/sale
- /collections/[category-name]
- /products/[product-name]
- /pages/[page-name]
- Short, clean paths with 2-3 segments

❌ REJECT these patterns (EPHEMERAL - will break/change):
- URLs containing promotional text: "10-off", "20-percent", "flash-sale", "extra-"
- URLs with campaign/promo codes: "welcome10", "holiday-special"
- URLs with exclusion terms: "ex-", "excluding-", "except-"
- URLs mentioning discounts in path: "shop-a-further-", "save-"
- Very long paths with 4+ segments

EXAMPLE for "NEW ARRIVALS" navigation:
Web search returns:
  1. /collections/new-arrivals ← USE THIS (evergreen)
  2. /collections/shop-a-further-10-off-ex-new-arrivals-luxe ← NEVER USE (promo)
  
ALWAYS pick the SHORTEST, CLEANEST path that matches the navigation text.
If only promo URLs exist, search again with "site:${domain} collections [term]" to find the base collection.

**MULTI-COLUMN SLICES** (when column/totalColumns metadata is present):
When a slice has metadata like (column: 0, totalColumns: 3):
- This is ONE cell of a multi-column product row
- Each column needs its OWN unique link (they are separate products/categories)
- Alt text should identify WHICH product/item this column contains
- The link should go to THAT SPECIFIC product, not a collection page
- Search for the specific product name visible in this column image
- Example: If you see "Blue Dress - $89" in one column, search for that exact product

For links: search "site:${domain} [topic]" to find real pages. If you can't find one, use https://${domain}/ and set linkVerified: false.

Return JSON with exactly ${slices.length} slices:
{
  "slices": [
    { "index": 0, "altText": "...", "isClickable": true/false, "suggestedLink": "https://..." or null, "linkVerified": true/false },
    { "index": 1, "altText": "...", ... },
    ...up to index ${slices.length - 1}
  ]
}`;

    // Build content array with text and all images for Claude
    const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [
      { type: 'text', text: prompt }
    ];

    // Add full campaign image FIRST for context (if provided)
    if (fullCampaignImage) {
      const fullMatches = fullCampaignImage.match(/^data:([^;]+);base64,(.+)$/);
      if (fullMatches) {
        content.push({
          type: 'text',
          text: '=== REFERENCE IMAGE (DO NOT ANALYZE - context only) ==='
        });
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: fullMatches[1],
            data: fullMatches[2]
          }
        });
      }
    }

    // Add each slice image with EXPLICIT labeling
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      
      // Build context string for multi-column slices
      let columnContext = '';
      if (slice.totalColumns && slice.totalColumns > 1) {
        columnContext = ` | COLUMN ${(slice.column ?? 0) + 1} of ${slice.totalColumns} (row ${slice.rowIndex ?? 0})`;
      }
      
      // Add explicit text label BEFORE each slice image
      content.push({
        type: 'text',
        text: `=== SLICE ${i + 1} (index: ${i})${columnContext} ===`
      });
      
      const matches = slice.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: matches[1],
            data: matches[2]
          }
        });
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 50,
          }
        ],
        messages: [
          { role: 'user', content }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      // Return default analysis if AI fails
      const defaultAnalysis: SliceAnalysis[] = slices.map((_, i) => ({
        index: i,
        altText: '',
        suggestedLink: null,
        isClickable: false,
        linkVerified: false
      }));
      
      return new Response(
        JSON.stringify({ analyses: defaultAnalysis, warning: 'AI analysis unavailable, using defaults' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await response.json();
    
    // Claude with web search returns multiple content blocks - we need to search ALL text blocks
    // for JSON as the response may come before/after tool use blocks
    let allTextContent = '';
    if (aiResponse.content && Array.isArray(aiResponse.content)) {
      // Log all block types for debugging
      const blockTypes = aiResponse.content.map((b: { type: string }) => b.type);
      console.log('Claude response block types:', blockTypes);
      
      // Collect ALL text blocks and concatenate them
      const textBlocks = aiResponse.content.filter((block: { type: string }) => block.type === 'text');
      allTextContent = textBlocks.map((block: { text?: string }) => block.text || '').join('\n');
      
      console.log('Total text blocks:', textBlocks.length);
      console.log('Combined text content length:', allTextContent.length);
      console.log('Text content preview:', allTextContent.substring(0, 500));
    } else {
      console.error('Unexpected response format:', JSON.stringify(aiResponse).substring(0, 500));
    }
    
    console.log('Claude response received');

    // Parse JSON from AI response - search through ALL text content
    // Build a Map keyed by index from AI response to avoid position-based misalignment
    const analysisByIndex = new Map<number, SliceAnalysis>();
    
    try {
      let jsonStr: string | null = null;
      
      // First try: look for markdown code block with json
      const codeBlockMatch = allTextContent.match(/```json\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
        console.log('Found JSON in markdown code block');
      }
      
      // Second try: look for raw JSON object with "slices" key
      if (!jsonStr) {
        const rawJsonMatch = allTextContent.match(/\{\s*"slices"\s*:\s*\[[\s\S]*?\]\s*\}/);
        if (rawJsonMatch) {
          jsonStr = rawJsonMatch[0];
          console.log('Found raw JSON with slices key');
        }
      }
      
      // Third try: find any JSON object
      if (!jsonStr) {
        const anyJsonMatch = allTextContent.match(/\{[\s\S]*\}/);
        if (anyJsonMatch) {
          jsonStr = anyJsonMatch[0];
          console.log('Found generic JSON object');
        }
      }
      
      console.log('JSON string found:', jsonStr ? 'yes' : 'no');
      if (jsonStr) {
        console.log('JSON preview:', jsonStr.substring(0, 300));
      }
      
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        const rawAnalyses: SliceAnalysis[] = parsed.slices || [];
        
        // Log AI-returned indices for debugging
        const aiIndices = rawAnalyses.map(a => a.index);
        console.log(`AI returned ${rawAnalyses.length} analyses with indices: [${aiIndices.slice(0, 10).join(', ')}${aiIndices.length > 10 ? '...' : ''}]`);
        console.log(`Expected indices: 0 to ${slices.length - 1} (${slices.length} slices)`);
        
        // Build map using AI-provided index, validating each entry
        for (const a of rawAnalyses) {
          const idx = typeof a.index === 'number' ? a.index : parseInt(String(a.index), 10);
          
          // Skip invalid indices
          if (isNaN(idx) || idx < 0 || idx >= slices.length) {
            console.warn(`Skipping analysis with invalid index: ${a.index} (expected 0-${slices.length - 1})`);
            continue;
          }
          
          // Skip duplicates (keep first occurrence)
          if (analysisByIndex.has(idx)) {
            console.warn(`Duplicate index ${idx} in AI response, keeping first occurrence`);
            continue;
          }
          
          // Validate and fix links
          let link = a.suggestedLink;
          let linkVerified = a.linkVerified ?? false;
          let linkWarning = a.linkWarning;
          
          if (a.isClickable && link) {
            // Check if it's a full URL or just a path
            if (!link.startsWith('http://') && !link.startsWith('https://')) {
              // Convert path to full URL
              const cleanBrandUrl = brandUrl?.replace(/\/$/, '') || `https://${domain}`;
              const cleanPath = link.startsWith('/') ? link : `/${link}`;
              link = `${cleanBrandUrl}${cleanPath}`;
              linkVerified = false;
              linkWarning = linkWarning || 'Path suggested without verification';
            }
            
            // Check if link is external
            if (domain && link) {
              try {
                const linkDomain = new URL(link).hostname.replace('www.', '');
                if (linkDomain !== domain) {
                  linkWarning = 'External link - verify this is correct';
                  linkVerified = false;
                }
              } catch {
                // Invalid URL
                linkWarning = 'Invalid URL format';
                linkVerified = false;
              }
            }
          }
          
          // Detect multi-CTA patterns in alt text that suggest this slice should have been split
          let multiCtaWarning: string | undefined = undefined;
          const altTextLower = (a.altText || '').toLowerCase();
          
          // Check for "X or Y" patterns suggesting multiple CTAs
          const orPattern = /\b(shop|buy|get|order|click to)\s+.{2,30}\s+or\s+.{2,30}/i;
          // Check for multiple distinct CTA phrases
          const multipleShopPattern = /(shop\s+\w+.*shop\s+\w+)|(buy\s+\w+.*buy\s+\w+)/i;
          // Check for side-by-side button indicators
          const sideBySidePattern = /\|\s*(shop|buy|order|get)/i;
          
          if (orPattern.test(altTextLower) || multipleShopPattern.test(altTextLower) || sideBySidePattern.test(altTextLower)) {
            multiCtaWarning = "This slice may contain multiple CTAs that should be split into separate columns";
            console.warn(`Slice ${idx} has multi-CTA pattern in alt text: "${a.altText?.substring(0, 100)}"`);
          }
          
          analysisByIndex.set(idx, {
            ...a,
            index: idx,
            suggestedLink: link,
            linkVerified,
            linkWarning,
            multiCtaWarning
          });
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
    }

    // Build final analyses array in strict index order 0..N-1
    const analyses: SliceAnalysis[] = [];
    for (let i = 0; i < slices.length; i++) {
      const existing = analysisByIndex.get(i);
      if (existing) {
        analyses.push(existing);
      } else {
        console.warn(`Missing analysis for index ${i}, using default`);
        analyses.push({
          index: i,
          altText: '',
          suggestedLink: null,
          isClickable: false,
          linkVerified: false
        });
      }
    }
    
    console.log(`Final analyses indices: [${analyses.map(a => a.index).join(', ')}]`);

    return new Response(
      JSON.stringify({ analyses }),
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
