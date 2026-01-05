import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callClaude(contentParts: any[], apiKey: string, retryCount = 0): Promise<Response> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 1024,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3
      }],
      messages: [{
        role: 'user',
        content: contentParts,
      }],
    }),
  });

  // Retry on rate limit with exponential backoff
  if (response.status === 429 && retryCount < 2) {
    const waitTime = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s
    console.log(`Rate limited, waiting ${waitTime}ms before retry ${retryCount + 1}...`);
    await new Promise(r => setTimeout(r, waitTime));
    return callClaude(contentParts, apiKey, retryCount + 1);
  }

  return response;
}

function extractJsonFromText(text: string): { name: string | null; url: string | null } | null {
  // Try direct JSON parse first
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {}

  // Try to find JSON object anywhere in text
  const jsonMatch = text.match(/\{\s*"name"\s*:\s*(?:"[^"]*"|null)\s*,\s*"url"\s*:\s*(?:"[^"]*"|null)\s*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  // Try reverse order (url, name)
  const jsonMatchReverse = text.match(/\{\s*"url"\s*:\s*(?:"[^"]*"|null)\s*,\s*"name"\s*:\s*(?:"[^"]*"|null)\s*\}/);
  if (jsonMatchReverse) {
    try {
      return JSON.parse(jsonMatchReverse[0]);
    } catch {}
  }

  // Extract name and url separately with regex
  const nameMatch = text.match(/"name"\s*:\s*"([^"]+)"/);
  const urlMatch = text.match(/"url"\s*:\s*"([^"]+)"/);
  
  if (nameMatch || urlMatch) {
    return {
      name: nameMatch ? nameMatch[1] : null,
      url: urlMatch ? urlMatch[1] : null
    };
  }

  // Last resort: find any URL in the text
  const anyUrlMatch = text.match(/https?:\/\/[^\s"'<>]+\.[a-z]{2,}/i);
  if (anyUrlMatch) {
    return {
      name: null,
      url: anyUrlMatch[0].replace(/[",}\]]+$/, '')
    };
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const imageDataUrls: string[] = Array.isArray(body?.imageDataUrls)
      ? body.imageDataUrls
      : (body?.imageDataUrl ? [body.imageDataUrl] : []);

    const cleanedImageDataUrls = (imageDataUrls || [])
      .filter((v) => typeof v === 'string' && v.includes(','))
      .slice(0, 2);

    // Get existing brands for intelligent matching
    const existingBrands: Array<{ id: string; name: string; domain: string; primaryColor?: string }> = 
      Array.isArray(body?.existingBrands) ? body.existingBrands : [];

    if (!cleanedImageDataUrls.length) {
      return new Response(
        JSON.stringify({ error: 'Image data URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Anthropic API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Detecting brand from image...', { existingBrandsCount: existingBrands.length });

    // Build prompt based on whether we have existing brands
    let prompt: string;
    
    if (existingBrands.length > 0) {
      const brandsList = existingBrands.map(b => 
        `- ID: "${b.id}", Name: "${b.name}", Domain: ${b.domain}${b.primaryColor ? `, Primary Color: ${b.primaryColor}` : ''}`
      ).join('\n');

      prompt = `You are analyzing an email campaign image to identify the brand.

EXISTING BRANDS IN SYSTEM:
${brandsList}

TASK: Identify the brand in this campaign and check if it matches an existing brand.

STEP 1 - Analyze the image for brand identity:
- Logo in header/footer
- Brand name text
- Website URLs or domain references
- Copyright notices
- Visual brand elements (colors, typography)

STEP 2 - Compare against existing brands:
- Match by name (exact or close variation, e.g., "Enhanced" matches "enhanced", "ENHANCED", "Enhanced.")
- Match by domain (ignore www prefix, e.g., "enhanced.com" matches "www.enhanced.com")
- Match by visual identity (similar colors, same logo style)

STEP 3 - Return result:
- If this campaign belongs to an EXISTING brand, return: {"matchedBrandId": "the-uuid-from-list"}
- If this is a NEW brand, use web search if needed to find official URL, then return: {"name": "Brand Name", "url": "https://brandwebsite.com"}
- If you cannot identify the brand at all: {"name": null, "url": null}

CRITICAL: Your response must be ONLY a JSON object. No explanation, no markdown, no other text.`;
    } else {
      prompt = `You are analyzing an email campaign image to identify the brand.

TASK: Find the brand name and their official website URL.

STEP 1 - Look in the image for:
- Logo in the header
- Brand name in header or footer
- Website URLs anywhere
- Copyright notice (e.g., "© 2024 BrandName")
- Any domain references

STEP 2 - If you found a brand name but NO URL in the image, use web search to find "[brand name] official website".

CRITICAL: Your response must be ONLY a JSON object. No explanation, no markdown, no other text.

Output format (nothing else):
{"name": "Brand Name", "url": "https://brandwebsite.com"}

If you cannot identify the brand:
{"name": null, "url": null}`;
    }

    const contentParts: any[] = cleanedImageDataUrls.map((imageDataUrl) => {
      const base64Data = imageDataUrl.split(',')[1];
      const mediaType = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data,
        },
      };
    });

    contentParts.push({
      type: 'text',
      text: prompt,
    });

    const response = await callClaude(contentParts, ANTHROPIC_API_KEY);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limited. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    console.log('Claude response:', JSON.stringify(data, null, 2));

    // Extract text content from the response (may include tool_use blocks)
    let content = '';
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          content += block.text;
        }
      }
    } else {
      content = data.content?.[0]?.text || '';
    }

    console.log('Extracted text content:', content);

    // Parse the JSON response with robust extraction
    let result: { matchedBrandId?: string; name?: string | null; url?: string | null } = {};
    
    // Check for matchedBrandId first
    const matchedIdMatch = content.match(/"matchedBrandId"\s*:\s*"([^"]+)"/);
    if (matchedIdMatch) {
      result.matchedBrandId = matchedIdMatch[1];
      console.log('Matched existing brand:', result.matchedBrandId);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No match found, extract name/url for new brand
    const extracted = extractJsonFromText(content);
    if (extracted) {
      result.name = extracted.name;
      result.url = extracted.url;
    }

    // Normalize URL if present
    if (result.url && !result.url.startsWith('http://') && !result.url.startsWith('https://')) {
      result.url = `https://${result.url}`;
    }

    // Clean up URL (remove trailing punctuation)
    if (result.url) {
      result.url = result.url.replace(/[.,;:!?)}\]]+$/, '');
    }

    console.log('Detected new brand:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in detect-brand-from-image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
