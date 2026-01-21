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
- If there's a headline, offer text, body copy, or CTA visible → capture the key message
- Include any visible text that communicates value (discounts, product benefits, urgency, etc.)
- For CTAs, end with "Click to [action]"
- ONLY return empty "" for slices that are PURELY decorative with ZERO text:
  - Solid color spacer bars or dividers
  - Footer bars with only icons (no readable text)
- If you can see ANY marketing text in the slice, it needs alt text

Examples:
- "How are you showing up in 2026?" headline → "How are you showing up in 2026? New routines. New habits. New goals."
- Body copy about products → "Our tonics are here to support you through the reset."
- Hero with headline + CTA → "Sale ends tonight! Click to Shop Now"
- CTA button visible → "Click to Shop Now"
- Product grid with product names → "Deep Sleep, Focus, Calming tonic. Click to shop."
- Solid color divider with NO text → "" (empty)

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

**LINKS** - Find the best destination:
- For header_logo slices or standalone brand logos → use brand homepage: https://${domain}/
- For CTA like "Shop [Product]" → search for that specific product page
- For general CTA like "Shop [Brand]" with multiple products mentioned → find "All Products", "Shop All", or category page
- If multiple products shown, find a collection/category containing them
- Use web search: "site:${domain} [product name]" or "site:${domain} collections" or "site:${domain} all products"
- Homepage is LAST RESORT (except for header logos where it's correct)

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
            max_uses: 5,
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
          
          analysisByIndex.set(idx, {
            ...a,
            index: idx,
            suggestedLink: link,
            linkVerified,
            linkWarning
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
