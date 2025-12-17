import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_FOOTER_RULES = `
You are an expert email developer creating a branded footer for email campaigns.

CRITICAL REQUIREMENTS:
1. Use table-based layout (not flexbox/grid) for email compatibility
2. All styles must be inline (no external CSS except for dark mode media query)
3. Total width must be exactly 600px
4. Use web-safe fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif
5. Social icons must be <img> tags with the provided iconUrl
6. Logo should be centered with max-width: 450px (not full 600px width)
7. Include dark mode support via @media (prefers-color-scheme: dark)

STRUCTURE:
- Wrap everything in a <tr> element (it will be inserted into an existing table)
- Use proper <td> cells with explicit widths and padding
- Logo section: centered, constrained width
- Social icons: horizontal row, centered, 32x32px icons with 12px gaps
- Navigation links (if any): centered text links
- Legal/copyright text: smaller font, muted color, centered
- Unsubscribe link placeholder: {{ unsubscribe }}

EXAMPLE OUTPUT STRUCTURE:
<tr>
  <td style="padding: 40px 0 0 0;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
      <!-- Logo row -->
      <tr>
        <td align="center" style="padding: 0 0 24px 0;">
          <img src="LOGO_URL" alt="Brand" style="max-width: 200px; height: auto; display: block;" />
        </td>
      </tr>
      <!-- Social icons row -->
      <tr>
        <td align="center" style="padding: 0 0 24px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding: 0 6px;"><a href="URL"><img src="ICON" width="32" height="32" alt="Platform" style="display: block;" /></a></td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Legal text -->
      <tr>
        <td align="center" style="padding: 24px 30px; font-size: 12px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
          © 2024 Brand Name. All rights reserved.<br>
          <a href="{{ unsubscribe }}" style="color: #888888;">Unsubscribe</a>
        </td>
      </tr>
    </table>
  </td>
</tr>

Return ONLY the HTML code, no explanation.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { referenceImageUrl, logoUrl, socialIcons, brandName, brandColors } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Build the prompt
    const socialIconsDescription = socialIcons?.length 
      ? `Social icons to include:\n${socialIcons.map((s: any) => `- ${s.platform}: URL=${s.url}, Icon=${s.iconUrl}`).join('\n')}`
      : 'No social icons provided.';

    const colorPalette = brandColors 
      ? `Brand colors:\n- Primary: ${brandColors.primary}\n- Secondary: ${brandColors.secondary}\n- Accent: ${brandColors.accent || 'none'}\n- Background: ${brandColors.background || '#111111'}\n- Text: ${brandColors.textPrimary || '#ffffff'}`
      : '';

    const userPrompt = `Create an email footer for "${brandName}" with these specifications:

${logoUrl ? `Logo URL: ${logoUrl}` : 'No logo provided - skip logo section'}

${socialIconsDescription}

${colorPalette}

The footer should have a dark background (use the brand background color or #111111) with light text.
Make it elegant and professional.

${referenceImageUrl ? 'A reference image has been provided - try to match its general layout and style.' : ''}`;

    // Build messages with optional image
    const content: any[] = [{ type: 'text', text: userPrompt }];
    
    if (referenceImageUrl) {
      content.unshift({
        type: 'image',
        source: {
          type: 'url',
          url: referenceImageUrl,
        },
      });
    }

    console.log('Generating footer for:', brandName);

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
        system: EMAIL_FOOTER_RULES,
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
    let html = data.content?.[0]?.text || '';

    // Clean up any markdown formatting
    html = html.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

    console.log('Footer generated successfully');

    return new Response(
      JSON.stringify({ html }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating footer:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to generate footer' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
