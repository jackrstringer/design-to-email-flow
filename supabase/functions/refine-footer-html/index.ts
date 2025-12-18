import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOOTER_REFINEMENT_RULES = `
You are an expert email HTML developer refining footer templates for pixel-perfect email rendering.

## STRICT HTML EMAIL RULES - NEVER VIOLATE

### FORBIDDEN (will break email rendering)
- NEVER use <div> elements - ALWAYS use <table> and <td>
- NEVER use CSS margin - Use padding on <td> or spacer rows
- NEVER use float or display: flex/grid - Use align attribute and nested tables
- NEVER use external CSS for layout - All styles must be inline
- NEVER omit width/height on images

### REQUIRED (for email compatibility)
- ALWAYS use <table role="presentation"> for layout
- ALWAYS set cellpadding="0" cellspacing="0" border="0" on tables
- ALWAYS inline all styles
- ALWAYS include width and height attributes on <img> tags
- ALWAYS add style="display: block; border: 0;" to images
- ALWAYS use web-safe fonts: Arial, Helvetica, sans-serif
- ALWAYS use 600px total width with MSO conditionals for Outlook

## CRITICAL: BACKGROUND COLOR PLACEMENT
- Background color MUST be on the INNER 600px table, NOT the outer 100% width wrapper
- Outer table: style="background-color: #ffffff;" (white - matches email body)
- Inner 600px table: style="background-color: {FOOTER_COLOR};" (the actual footer color)
- This ensures footer background only covers the centered content area

## LOGO HANDLING (CRITICAL)
- The logo MUST ALWAYS be an <img> tag with the provided logo URL
- NEVER render the brand name as text when logo URL is provided
- If current HTML has text instead of logo image, REPLACE it with <img>

## STRUCTURE TEMPLATE
\`\`\`html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff;">
  <tr>
    <td align="center">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: {BG};">
        {CONTENT ROWS}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
\`\`\`

When comparing to reference image, match EXACTLY:
- Background colors (exact hex values)
- Spacing/padding (exact pixel values)
- Typography (font sizes, weights, line heights)
- Social icon size (usually 32x32) and spacing
- Overall proportions and alignment

Return ONLY the refined HTML code, no explanation or markdown formatting.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      currentHtml, 
      userRequest, 
      referenceImageUrl, 
      brandContext, 
      logoUrl,
      lightLogoUrl,
      darkLogoUrl,
      websiteUrl,
      allLinks,
      socialIcons
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Check if any logo is available
    const hasAnyLogo = logoUrl || lightLogoUrl || darkLogoUrl;

    // Build the refinement prompt
    let prompt = `Current footer HTML to refine:

\`\`\`html
${currentHtml}
\`\`\`

`;
    
    if (userRequest) {
      prompt += `User's refinement request: "${userRequest}"

`;
    }

    // Add logo section with BOTH options clearly labeled
    if (hasAnyLogo) {
      prompt += `## AVAILABLE LOGO ASSETS (CRITICAL - USE AS <img> TAGS)
${lightLogoUrl ? `- **LIGHT/WHITE LOGO** (USE FOR DARK BACKGROUNDS): ${lightLogoUrl}` : ''}
${darkLogoUrl ? `- **DARK/BLACK LOGO** (USE FOR LIGHT BACKGROUNDS): ${darkLogoUrl}` : ''}
${logoUrl && !lightLogoUrl && !darkLogoUrl ? `- **LOGO**: ${logoUrl}` : ''}

### LOGO SELECTION RULES:
1. Analyze the footer background color
2. If background is DARK (luminance < 50%): USE THE LIGHT/WHITE LOGO
3. If background is LIGHT (luminance >= 50%): USE THE DARK/BLACK LOGO
4. If user says "white logo", "light logo": Use ${lightLogoUrl || logoUrl || 'light logo'}
5. If user says "dark logo", "black logo": Use ${darkLogoUrl || logoUrl || 'dark logo'}
6. ALWAYS use the logo as an <img> tag - NEVER render brand name as text
7. Example: <img src="[SELECTED_LOGO_URL]" alt="${brandContext?.name || 'Logo'}" width="180" height="40" style="display: block; border: 0;">

`;
    }

    if (brandContext) {
      prompt += `## BRAND STYLE GUIDE
- Name: ${brandContext.name || 'Not specified'}
- Domain: ${brandContext.domain || 'Not specified'}
- Colors (use EXACT hex values):
  - Primary: ${brandContext.colors?.primary || 'N/A'}
  - Secondary: ${brandContext.colors?.secondary || 'N/A'}
  - Accent: ${brandContext.colors?.accent || 'N/A'}
  - Background: ${brandContext.colors?.background || '#111111'}
  - Text: ${brandContext.colors?.textPrimary || '#ffffff'}
  - Link: ${brandContext.colors?.link || brandContext.colors?.primary || '#ffffff'}

When user mentions "brand blue", "primary color", etc., use the exact hex values above.

## CLICKABILITY REQUIREMENTS (CRITICAL)
ALL interactive elements MUST be wrapped in <a> tags with REAL URLs:

1. LOGO must link to: ${websiteUrl || brandContext?.websiteUrl || `https://${brandContext?.domain}` || '#'}
   Structure: <a href="[WEBSITE_URL]" target="_blank"><img src="..." /></a>

2. SOCIAL ICONS - each must link to its platform URL
${socialIcons?.length ? socialIcons.map((s: any) => `   - ${s.platform}: <a href="${s.url}" target="_blank"><img src="${s.iconUrl}" .../></a>`).join('\n') : '   (Use provided social icon URLs)'}

3. NAVIGATION LINKS - text links must use brand URLs
${allLinks?.length ? `Available links:\n${allLinks.slice(0, 8).map((link: string) => `   - ${link}`).join('\n')}` : ''}

DO NOT use placeholder links like "#" or "javascript:void(0)".
`;
    }

    if (referenceImageUrl) {
      prompt += `
## REFERENCE IMAGE PROVIDED
Compare the current HTML to the reference image and ensure the footer matches:
- Exact layout structure (section arrangement, alignment)
- Exact colors (background, text - match hex values from reference)
- Exact spacing and padding (measure proportions)
- Typography sizes and weights
- Social icon arrangement and sizing
- Overall visual appearance
- BUT: Always use the provided logo URL as <img>, not text

Make targeted adjustments to achieve PIXEL-PERFECT matching.`;
    }

    prompt += `

Return the refined HTML code. Only output the HTML, no explanations.`;

    // Build messages with logo images FIRST so Claude can SEE them
    const content: any[] = [];
    
    // CRITICAL: Show Claude the actual logo images so it knows what they look like
    if (lightLogoUrl || darkLogoUrl) {
      content.push({ 
        type: 'text', 
        text: '## LOGO IMAGES (LOOK AT THESE - YOU MUST USE ONE AS <img> TAG)\n\nThese are the actual logo images:' 
      });
      
      if (lightLogoUrl) {
        content.push({
          type: 'image',
          source: { type: 'url', url: lightLogoUrl }
        });
        content.push({ type: 'text', text: `↑ LIGHT/WHITE LOGO - URL: ${lightLogoUrl}\nUse this for DARK backgrounds.` });
      }
      
      if (darkLogoUrl) {
        content.push({
          type: 'image',
          source: { type: 'url', url: darkLogoUrl }
        });
        content.push({ type: 'text', text: `↑ DARK/BLACK LOGO - URL: ${darkLogoUrl}\nUse this for LIGHT backgrounds.` });
      }
      
      content.push({ 
        type: 'text', 
        text: '\n---\nUse one of these logos as <img src="...">. NEVER render brand name as text.\n---\n' 
      });
    }
    
    // Note: Social icons passed as text in prompt - CDN URLs can't be downloaded by Claude API
    
    // Then add reference image
    if (referenceImageUrl) {
      content.push({
        type: 'image',
        source: {
          type: 'url',
          url: referenceImageUrl,
        },
      });
      content.push({ type: 'text', text: '↑ REFERENCE - Match this but use the logo IMAGE and social icon URLs shown above.' });
    }
    
    content.push({ type: 'text', text: prompt });

    console.log('Refining footer HTML', {
      hasUserRequest: !!userRequest,
      hasReference: !!referenceImageUrl,
      hasLightLogo: !!lightLogoUrl,
      hasDarkLogo: !!darkLogoUrl,
      hasGenericLogo: !!logoUrl
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

    console.log('Footer refined successfully, length:', refinedHtml.length);

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
