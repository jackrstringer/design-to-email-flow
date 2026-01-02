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
    
    const prompt = `Analyze these email campaign slices.

${fullCampaignImage ? 'First image is the full campaign for context. Then individual slices follow.' : ''}

Brand: ${domain || 'Unknown'}

For each slice, look at the image and tell me:
1. Alt text (max 100 chars) - describe what's shown
2. Is there a button or CTA? If yes → isClickable: true and suggest a link
3. No button → isClickable: false

For links: search "site:${domain} [topic]" to find real pages. If you can't find one, use https://${domain}/ and set linkVerified: false.

Return JSON:
{
  "slices": [
    { "index": 0, "altText": "...", "isClickable": true/false, "suggestedLink": "https://..." or null, "linkVerified": true/false }
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
    let analyses: SliceAnalysis[] = [];
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
