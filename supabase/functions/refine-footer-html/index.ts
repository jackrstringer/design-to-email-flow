import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOOTER_REFINEMENT_RULES = `
You are an expert email developer refining a branded footer for email campaigns.

Your task is to analyze the current HTML footer and improve it based on:
1. Visual comparison to the reference image (if provided)
2. User's specific refinement requests (if provided)

CRITICAL - LOGO HANDLING:
- The logo MUST ALWAYS be an <img> tag with the provided logo URL
- NEVER render the brand name or logo as text
- If the current HTML has text instead of a logo image, REPLACE it with an <img> tag
- This is NON-NEGOTIABLE

CRITICAL EMAIL REQUIREMENTS:
1. Use table-based layout (not flexbox/grid) for email compatibility
2. All styles must be inline (no external CSS except for dark mode media query in <style> tag)
3. Total width must be exactly 600px
4. Use web-safe fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif
5. Maintain the existing structure unless explicitly asked to change it
6. Keep all social icons as <img> tags with proper dimensions (32x32px)

When comparing to reference image, check for:
- Layout structure and section ordering
- Colors (background, text, links) - match EXACT hex values
- Spacing and padding (top, bottom, between elements)
- Logo size and positioning (MUST be <img> tag)
- Social icon arrangement and sizing
- Typography (font sizes, weights, line heights)
- Overall proportions and visual balance

Return ONLY the refined HTML code, no explanation or markdown formatting.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentHtml, userRequest, referenceImageUrl, brandContext, logoUrl } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Build the refinement prompt
    let prompt = `Here is the current footer HTML:\n\n${currentHtml}\n\n`;
    
    if (userRequest) {
      prompt += `User's refinement request: "${userRequest}"\n\n`;
    }

    // Add logo enforcement
    if (logoUrl) {
      prompt += `CRITICAL LOGO REQUIREMENT:
The logo MUST be an <img> tag using this exact URL: ${logoUrl}
Do NOT render the brand name as text - ALWAYS use the logo image.
If the current HTML has text instead of a logo, REPLACE it with: <img src="${logoUrl}" alt="${brandContext?.name || 'Logo'}" style="display:block; max-width:200px; height:auto; margin:0 auto;">

`;
    }

    if (brandContext) {
      prompt += `Brand context:
- Name: ${brandContext.name}
- Domain: ${brandContext.domain}
- Colors:
  - Primary: ${brandContext.colors?.primary || 'N/A'}
  - Secondary: ${brandContext.colors?.secondary || 'N/A'}
  - Accent: ${brandContext.colors?.accent || 'N/A'}
  - Background: ${brandContext.colors?.background || '#111111'}
  - Text: ${brandContext.colors?.textPrimary || '#ffffff'}
  - Link: ${brandContext.colors?.link || brandContext.colors?.primary || '#ffffff'}

When user mentions brand colors like "brand blue" or "primary color", use the exact hex values above.
`;
    }

    if (referenceImageUrl) {
      prompt += `\nA reference image has been provided. Compare the current HTML rendering to the reference image and ensure the footer matches:
- The exact layout structure (section arrangement, alignment)
- Colors (background colors, text colors - match exact hex values visible in the reference)
- Spacing and padding (proportions between elements)
- Typography sizes and weights
- Overall visual appearance
- BUT ALWAYS use the provided logo URL as an <img> tag, not text

Make targeted adjustments to achieve PIXEL-PERFECT matching with the reference.`;
    }

    prompt += `\n\nReturn the refined HTML code. Only output the HTML, no explanations.`;

    // Build messages with optional image
    const content: any[] = [];
    
    if (referenceImageUrl) {
      content.push({
        type: 'image',
        source: {
          type: 'url',
          url: referenceImageUrl,
        },
      });
    }
    
    content.push({ type: 'text', text: prompt });

    console.log('Refining footer HTML', userRequest ? `with request: ${userRequest}` : '(auto-refinement)', logoUrl ? '(with logo URL)' : '(no logo)');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: FOOTER_REFINEMENT_RULES,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    let refinedHtml = data.content?.[0]?.text || '';

    // Clean up any markdown formatting
    refinedHtml = refinedHtml.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

    console.log('Footer refined successfully');

    return new Response(
      JSON.stringify({ refinedHtml }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error refining footer:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to refine footer' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
