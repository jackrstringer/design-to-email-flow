import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const prompt = `You will be given 1-2 cropped views of the same email campaign (usually header + footer).

TASK: Identify the brand name and the brand's website URL from the email.

Look for:
- Logo in the header
- Brand name in header or footer
- Website URLs anywhere in the email
- Copyright notice in the footer (e.g., "© 2024 BrandName")
- Any domain references

Return ONLY valid JSON (no markdown, no explanation):
{"name": "Brand Name", "url": "https://brandwebsite.com"}

If you cannot identify the brand, return:
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: contentParts,
        }],
      }),
    });

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
    const content = data.content?.[0]?.text || '';
    
    console.log('Claude response:', content);

    // Parse the JSON response
    let brandInfo = { name: null, url: null };
    try {
      // Clean up potential markdown formatting
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
      brandInfo = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse brand info:', parseError);
      // Try to extract URL with regex as fallback
      const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/);
      if (urlMatch) {
        brandInfo.url = urlMatch[0].replace(/[",}].*$/, '');
      }
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