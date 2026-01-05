import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl, width, height, isFirstCampaign, existingBrands } = await req.json();
    
    if (!imageDataUrl) {
      throw new Error('No image data provided');
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    console.log(`Analyzing image: ${width}×${height}, isFirstCampaign: ${isFirstCampaign}`);
    console.log(`Existing brands provided: ${existingBrands?.length || 0}`);

    // Extract base64 and media type from data URL
    const dataUrlMatch = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      throw new Error('Invalid image data URL format');
    }
    const mediaType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];

    // Build brand matching context if existing brands are provided
    const brandMatchingContext = existingBrands?.length > 0 
      ? `\n\nEXISTING BRANDS IN OUR SYSTEM:
${existingBrands.map((b: any) => `- ID: "${b.id}", Name: "${b.name}", Domain: "${b.domain}"`).join('\n')}

BRAND MATCHING RULES:
1. If this email clearly belongs to one of the existing brands above (based on logo, brand name, domain, colors, or any visual identifiers), return its ID in "matchedBrandId".
2. If it's a new brand NOT in the list above, set "matchedBrandId" to null and EXTRACT the brand info from the email itself:
   - Look for the brand logo, header text, footer company name
   - Look for any URLs in the email (website links, social links)
   - Set "detectedBrand.name" to the company/brand name you see
   - Set "detectedBrand.url" to the brand's website (e.g., "https://brandname.com")`
      : `\n\nBRAND DETECTION:
Since there are no existing brands, you MUST extract the brand information from this email:
- Look for the brand logo, header text, footer company name, copyright notice
- Look for any URLs in the email (website links, social links, domain references)
- Set "detectedBrand.name" to the company/brand name you can identify
- Set "detectedBrand.url" to the brand's website URL (e.g., "https://brandname.com")
IMPORTANT: You MUST provide detectedBrand with name and url - examine the email carefully for any brand identifiers.`;

    const userPrompt = `Analyze this email campaign image.

FIRST: Identify the brand. ${brandMatchingContext}

THEN: Break the email down into horizontal sections from top to bottom.

For each section, return:
- id (short, snake_case)
- name
- type: "image" or "code"
- yStart and yEnd as INTEGERS from 0-100 (100 is the bottom)
- isFooter: true if this is part of the footer area

Rules:
- First section must start at 0
- Last section must end at 100
- Sections must be contiguous (next yStart = previous yEnd)
- Split at obvious visual boundaries

Return JSON only (no markdown):
{"matchedBrandId":"uuid-or-null","detectedBrand":{"url":"https://example.com","name":"Brand Name"},"blocks":[{"id":"header_logo","name":"Header Logo","type":"image","yStart":0,"yEnd":5,"isFooter":false}]}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 4096,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: userPrompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Claude API failed: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;
    
    if (!content) {
      throw new Error('No response from Claude');
    }

    console.log('Claude raw response:', content);

    // Parse JSON
    let jsonStr = content.trim();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const matchedBrandId = parsed.matchedBrandId || null;
    const detectedBrand = parsed.detectedBrand || null;
    
    if (matchedBrandId) {
      console.log(`Matched existing brand ID: ${matchedBrandId}`);
    } else if (detectedBrand) {
      console.log(`Detected new brand: ${detectedBrand.name} (${detectedBrand.url})`);
    }

    // Convert percentage-based blocks to pixel coordinates
    const rawBlocks = parsed.blocks || [];

    const blocks = rawBlocks
      .map((block: any, index: number) => {
        const yStartPct = typeof block.yStart === 'number' ? block.yStart : 0;
        const yEndPct = typeof block.yEnd === 'number' ? block.yEnd : 100;
        
        // Convert percentages to pixels
        const y = Math.round((yStartPct / 100) * height);
        const h = Math.round(((yEndPct - yStartPct) / 100) * height);

        return {
          id: block.id || `block-${index}`,
          name: block.name || `Block ${index + 1}`,
          type: block.type === 'image' ? 'image' : 'code',
          bounds: { 
            x: 0, 
            y: Math.max(0, y), 
            width: width, 
            height: Math.max(10, h) 
          },
          suggestedLink: block.suggestedLink || '',
          altText: block.altText || '',
          isFooter: Boolean(block.isFooter),
        };
      })
      .sort((a: any, b: any) => a.bounds.y - b.bounds.y);

    // Log final blocks
    console.log('Final blocks:');
    blocks.forEach((b: any) => {
      console.log(`  ${b.name}: y=${b.bounds.y}, h=${b.bounds.height}, bottom=${b.bounds.y + b.bounds.height}`);
    });

    const finalMaxBottom = Math.max(...blocks.map((b: any) => b.bounds.y + b.bounds.height));
    console.log(`Final coverage: ${((finalMaxBottom / height) * 100).toFixed(1)}%`);

    const footerBlocks = blocks.filter((b: any) => b.isFooter);

    return new Response(JSON.stringify({
      blocks,
      analyzedWidth: width,
      analyzedHeight: height,
      hasFooter: footerBlocks.length > 0,
      footerStartIndex: footerBlocks.length > 0 ? blocks.findIndex((b: any) => b.isFooter) : -1,
      matchedBrandId,
      detectedBrand,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in analyze-email-design:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});