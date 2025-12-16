import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HTML_EMAIL_RULES = `
# HTML Email Building Rules - YOU MUST FOLLOW THESE EXACTLY

## CRITICAL: Match the Original Design EXACTLY
- Your HTML must look IDENTICAL to the image slice provided
- Match ALL text exactly (fonts, sizes, colors, spacing, alignment)
- Match ALL colors precisely (use the exact hex values from the design)
- Match ALL spacing and padding exactly
- Match ALL layouts and alignments exactly
- If it has a background color, use that exact background color
- If it has specific typography styling, replicate it exactly

## Structure Rules
1. Use ONLY tables for layout - never use divs, flexbox, or grid
2. All CSS must be inline - no external stylesheets or <style> blocks
3. Use web-safe fonts: Arial, Helvetica, Georgia, Times New Roman
4. All tables must have: border="0" cellpadding="0" cellspacing="0"
5. Max width should be 600px

## Image Rules
- All images must use display: block
- Set explicit width and height attributes
- Include descriptive alt text

## Text/Typography Rules
- Use inline styles for all text: font-family, font-size, font-weight, color, line-height
- Use align attribute AND text-align style for maximum compatibility
- Common stack: font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;

## Button/CTA Rules
Use this exact pattern for buttons:
<table border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td align="center">
      <table border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color: #HEXCOLOR; border-radius: 4px;">
            <a href="LINK_URL" target="_blank" style="display: block; padding: 16px 32px; font-family: Arial, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">
              BUTTON TEXT
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

## DO NOT USE:
- JavaScript
- External CSS files or @import
- Google Fonts or custom fonts
- CSS position, float, flexbox, or grid
- box-shadow (unreliable)
- Forms or input elements

## Output Format
Return ONLY the raw HTML code for this section - no markdown, no explanation, no code fences.
The HTML should be a complete table row or set of table rows that can be inserted directly into an email template.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sliceDataUrl, brandUrl, sliceIndex, totalSlices } = await req.json();

    if (!sliceDataUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing sliceDataUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating HTML for slice ${sliceIndex + 1} of ${totalSlices}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = `You are an expert HTML email developer. Convert this email design section into flawless HTML email code.

${HTML_EMAIL_RULES}

CONTEXT:
- This is slice ${sliceIndex + 1} of ${totalSlices} from an email campaign
- Brand website: ${brandUrl || 'Not specified'}
- This slice needs to be converted to pure HTML (not an image)

ANALYZE THE IMAGE AND:
1. Identify all text content, colors, fonts, and spacing
2. Identify any CTAs/buttons and their styling
3. Identify background colors and any design elements
4. Create HTML that EXACTLY matches the visual design

Return ONLY the HTML code - no explanation, no markdown code fences, just raw HTML.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: sliceDataUrl } }
            ]
          }
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error('AI HTML generation failed');
    }

    const aiResponse = await response.json();
    let htmlContent = aiResponse.choices?.[0]?.message?.content || '';
    
    console.log('HTML generated successfully');

    // Clean up the response - remove markdown code fences if present
    htmlContent = htmlContent
      .replace(/^```html?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    return new Response(
      JSON.stringify({ htmlContent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in generate-slice-html:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
