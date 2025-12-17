import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
      model: 'claude-sonnet-4-20250514',
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

    console.log('Detecting brand from image...');

    const prompt = `You are analyzing an email campaign image to identify the brand.

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
    let brandInfo: { name: string | null; url: string | null } = { name: null, url: null };
    
    const extracted = extractJsonFromText(content);
    if (extracted) {
      brandInfo = extracted;
    }

    // Normalize URL if present
    if (brandInfo.url && !brandInfo.url.startsWith('http://') && !brandInfo.url.startsWith('https://')) {
      brandInfo.url = `https://${brandInfo.url}`;
    }

    // Clean up URL (remove trailing punctuation)
    if (brandInfo.url) {
      brandInfo.url = brandInfo.url.replace(/[.,;:!?)}\]]+$/, '');
    }

    console.log('Detected brand:', brandInfo);

    return new Response(
      JSON.stringify(brandInfo),
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
