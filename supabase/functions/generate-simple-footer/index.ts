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
    const { 
      referenceImageUrl, 
      iconUrls,  // Array<{ name: string, url: string }>
      logoUrl    // Optional - only include if detected/provided
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!referenceImageUrl) {
      throw new Error('Reference image URL is required');
    }

    console.log('Generate simple footer:', { 
      hasReferenceImage: !!referenceImageUrl,
      iconCount: iconUrls?.length || 0,
      hasLogo: !!logoUrl
    });

    // Build the simple, direct prompt (exactly like the successful test)
    let assetsList = '';
    if (iconUrls && iconUrls.length > 0) {
      assetsList = iconUrls.map((icon: { name: string; url: string }) => 
        `- ${icon.name}: ${icon.url}`
      ).join('\n');
    }
    if (logoUrl) {
      assetsList += `\n- Logo: ${logoUrl}`;
    }

    const prompt = `Make this footer design into pixel-perfect HTML code for use as an email footer.

${assetsList ? `Here are the assets used:\n${assetsList}` : ''}

Rules:
- 600px max width, table-based layout
- All styles inline (no <style> tags)
- Match the design EXACTLY - colors, spacing, typography
- Use the provided asset URLs directly in the HTML
- Return ONLY the HTML code, no explanation`;

    // Single Claude call with reference image
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: referenceImageUrl }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    let html = data.content?.[0]?.text || '';
    
    // Extract HTML if wrapped in code blocks
    const htmlMatch = html.match(/```html\n?([\s\S]*?)```/);
    if (htmlMatch) {
      html = htmlMatch[1].trim();
    } else {
      // Also try without html label
      const codeMatch = html.match(/```\n?([\s\S]*?)```/);
      if (codeMatch) {
        html = codeMatch[1].trim();
      }
    }

    console.log('Generated footer HTML length:', html.length);

    return new Response(JSON.stringify({ 
      success: true,
      html 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Generate simple footer error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
