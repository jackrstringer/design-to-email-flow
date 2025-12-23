import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceInput {
  dataUrl: string;
  index: number;
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

    const sliceDescriptions = slices.map((s, i) => `Slice ${i + 1}`).join(', ');
    
    const prompt = `You are analyzing an email marketing campaign. 

STEP 1 - UNDERSTAND THE FULL CAMPAIGN CONTEXT:
${fullCampaignImage ? 'The FIRST image below shows the FULL campaign. Study it to understand:' : 'No full campaign image provided.'}
- What is the PRIMARY focus of this email? (specific product, collection, promotion, announcement)
- What product name, offer, or topic is being highlighted?
- What action should the main CTAs drive users toward?

STEP 2 - ANALYZE INDIVIDUAL SLICES:
After the full campaign (if provided), you'll see ${slices.length} individual slices: ${sliceDescriptions}.

CRITICAL CONTEXT RULE:
- If the campaign focuses on a SPECIFIC product, ALL relevant CTAs should link to that product's page
- Hero CTAs like "Shop Now", "Claim Savings", "Get Started" should link to the SPECIFIC product/offer featured, NOT generic pages like "shop-all" or "collections"
- Only use collection/shop-all pages if the campaign genuinely promotes multiple products equally

IMPORTANT: You have access to web search. USE IT to find REAL pages on the brand's website.

BRAND WEBSITE: ${brandUrl || 'Unknown'}
BRAND DOMAIN: ${domain || 'Unknown'}

FOR EACH CLICKABLE SLICE:
1. Use the full campaign context to understand what this slice is promoting
2. Use web search to find the SPECIFIC product/page that matches the campaign focus
3. Search queries like: "site:${domain} [product name from campaign]" or "site:${domain} [specific offer]"
4. ONLY suggest links you've verified exist via search
5. If you can't find a matching page via search, you may suggest a logical path but mark linkVerified: false

ALT TEXT RULES:
- Write the actual campaign copy/text visible in the slice, condensed and spoken as if to someone who cannot see it
- For CTAs/buttons: Add "Click to" prefix (e.g., "Click to Schedule Consultation")
- For hero text: Include the headline copy (e.g., "It's time to get Enhanced")
- For logos: ONLY the brand name - never say "logo"
- Max 100 chars

LINK RULES:
- Use FULL URLs (e.g., "https://${domain}/schedule" not "/schedule")
- If you found the link via web search, set linkVerified: true
- If you couldn't verify but are suggesting a logical path, set linkVerified: false and add linkWarning
- If a link points outside ${domain}, set linkVerified: false and add linkWarning: "External link - verify this is correct"

Respond in JSON format:
{
  "slices": [
    {
      "index": 0,
      "altText": "alt text here",
      "isClickable": true/false,
      "suggestedLink": "https://full-url-here" or null,
      "linkVerified": true/false,
      "linkWarning": "Optional warning if unverified or external"
    }
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
          type: 'image',
          source: {
            type: 'base64',
            media_type: fullMatches[1],
            data: fullMatches[2]
          }
        });
        content.push({
          type: 'text',
          text: '↑ FULL CAMPAIGN IMAGE - Study this first to understand the campaign focus before analyzing individual slices below.'
        });
      }
    }

    // Add each slice image in Claude's format
    for (const slice of slices) {
      // Extract base64 data and media type from data URL
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
        model: 'claude-opus-4-1-20250805',
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
        altText: `Email section ${i + 1}`,
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
    
    // Claude with web search returns multiple content blocks - we need to find ALL text blocks
    // and concatenate them, as the JSON response may come after tool use blocks
    let aiContent = '';
    if (aiResponse.content && Array.isArray(aiResponse.content)) {
      // Log all block types for debugging
      const blockTypes = aiResponse.content.map((b: { type: string }) => b.type);
      console.log('Claude response block types:', blockTypes);
      
      // Collect all text blocks - the final JSON is usually in the last text block
      const textBlocks = aiResponse.content.filter((block: { type: string }) => block.type === 'text');
      if (textBlocks.length > 0) {
        // Use the last text block as it contains the final response after web searches
        aiContent = textBlocks[textBlocks.length - 1].text || '';
      }
      console.log('Extracted text content length:', aiContent.length);
      console.log('Text content preview:', aiContent.substring(0, 500));
    } else {
      console.error('Unexpected response format:', JSON.stringify(aiResponse).substring(0, 500));
    }
    
    console.log('Claude response received');

    // Parse JSON from AI response
    let analyses: SliceAnalysis[] = [];
    try {
      // Extract JSON from response (might be wrapped in markdown code blocks)
      let jsonMatch = aiContent.match(/```json\s*([\s\S]*?)```/);
      let jsonStr = jsonMatch ? jsonMatch[1] : null;
      
      // If no markdown code block, try to find raw JSON
      if (!jsonStr) {
        jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        jsonStr = jsonMatch ? jsonMatch[0] : null;
      }
      
      console.log('JSON string found:', jsonStr ? 'yes' : 'no');
      
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        analyses = parsed.slices || [];
        
        // Ensure indices are correct and validate links
        analyses = analyses.map((a: SliceAnalysis, i: number) => {
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
          
          return { 
            ...a, 
            index: i, 
            suggestedLink: link,
            linkVerified,
            linkWarning
          };
        });
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
    }

    // Fill in any missing slices with defaults
    while (analyses.length < slices.length) {
      analyses.push({
        index: analyses.length,
        altText: `Email section ${analyses.length + 1}`,
        suggestedLink: null,
        isClickable: false,
        linkVerified: false
      });
    }

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
