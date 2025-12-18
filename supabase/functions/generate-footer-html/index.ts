import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_FOOTER_RULES = `
You are an expert email HTML developer that converts footer designs into pixel-perfect HTML code for email templates.

## STEP 1: ANALYZE THE DESIGN

### Background Color Detection
Before anything else, determine the footer's background color luminance:
- If luminance < 50% (dark background): Use LIGHT/WHITE logo, white text, white social icons
- If luminance >= 50% (light background): Use DARK/BLACK logo, dark text, dark social icons

Luminance calculation: luminance = (0.299 × R + 0.587 × G + 0.114 × B) / 255

### Extract These Measurements (in pixels)
1. Total width - Usually 600px for email
2. Padding - Top, right, bottom, left (often asymmetric)
3. Logo dimensions - Exact width/height
4. Spacing between elements - Gap between logo and nav, nav and social, etc.
5. Font sizes - Each text element
6. Icon sizes - Social icons (typically 24-40px)
7. Icon spacing - Gap between each social icon
8. Line heights - Especially for disclaimer text
9. Divider lines - Thickness, color, width, margins

## STEP 2: SELECT ASSETS

### Logo Selection Rule (CRITICAL)
- If a logoUrl is provided, you MUST use it as an <img> tag
- NEVER render the brand name as text when a logo image URL is given
- Use the exact URL provided - do not modify it

### Social Icon URLs
Use the exact iconUrl provided for each social platform.

## STEP 3: GENERATE HTML

### GOLDEN RULES - NEVER VIOLATE THESE
1. NEVER use <div> - Always <table> and <td>
2. NEVER use margin - Use padding on <td> or empty spacer rows
3. NEVER use float or flexbox - Use align attribute and nested tables
4. ALWAYS inline all styles - No external CSS except dark mode media query
5. ALWAYS set cellpadding="0" cellspacing="0" border="0" on tables
6. ALWAYS add role="presentation" to layout tables
7. ALWAYS include width and height attributes on images
8. ALWAYS add style="display: block; border: 0;" to images
9. CRITICAL: Background color MUST be on the INNER 600px table, NOT the outer wrapper
   - Outer 100% width table: background-color: #ffffff (white)
   - Inner 600px table: background-color: {actual footer color}
   - This ensures the footer background only covers the content area, not full email width

### BASE TEMPLATE STRUCTURE
\`\`\`html
<!-- FOOTER START -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff;">
  <tr>
    <td align="center">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: {BG_COLOR};">
        
        {LOGO_ROW}
        {NAV_ROWS}
        {SOCIAL_ROW}
        {LEGAL_ROW}
        
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
<!-- FOOTER END -->
\`\`\`

### LOGO ROW TEMPLATE
\`\`\`html
<tr>
  <td align="center" style="padding: {TOP}px {RIGHT}px {BOTTOM}px {LEFT}px;">
    <a href="{WEBSITE_URL}" target="_blank" style="text-decoration: none;">
      <img src="{LOGO_URL}" alt="{BRAND}" width="{W}" height="{H}" style="display: block; border: 0;">
    </a>
  </td>
</tr>
\`\`\`

### SOCIAL ICONS ROW TEMPLATE
\`\`\`html
<tr>
  <td align="center" style="padding: {TOP}px 0 {BOTTOM}px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding: 0 {HALF_GAP}px;">
          <a href="{SOCIAL_URL}" target="_blank">
            <img src="{ICON_URL}" alt="{PLATFORM}" width="{SIZE}" height="{SIZE}" style="display: block; border: 0;">
          </a>
        </td>
        <!-- Repeat for each platform -->
      </tr>
    </table>
  </td>
</tr>
\`\`\`

### LEGAL/DISCLAIMER ROW TEMPLATE
\`\`\`html
<tr>
  <td align="center" style="padding: {TOP}px {SIDE}px {BOTTOM}px {SIDE}px;">
    <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: {SIZE}px; line-height: {LH}px; color: {COLOR}; text-align: center;">
      {LEGAL_TEXT}
    </p>
  </td>
</tr>
\`\`\`

## VALIDATION CHECKLIST (Before Returning)
- [ ] Background color matches design exactly
- [ ] Correct logo version used (light for dark bg, dark for light bg)
- [ ] Logo is an <img> tag with width, height, alt, display:block, border:0
- [ ] All spacing/padding matches design measurements
- [ ] Font sizes match design
- [ ] All social platforms included with correct icons
- [ ] Social icons have correct size and spacing
- [ ] Legal text styled correctly
- [ ] No prohibited CSS (div, margin, float, flex)
- [ ] All images have width, height, alt attributes
- [ ] MSO conditionals included for Outlook
- [ ] role="presentation" on all tables
- [ ] Total width is exactly 600px

Return ONLY the HTML code, no explanation or markdown formatting.
`;

const VALIDATION_PROMPT = `
You are performing STRICT validation of generated HTML against a reference footer image.
This validation must be EXTREMELY PRECISE for pixel-perfect matching.

Compare the HTML to the reference image and check:

1. LAYOUT STRUCTURE
   - Section order matches exactly (logo → nav → social → legal)
   - Alignment (center, left, right) matches reference
   - Grid/column layouts match if present

2. COLORS (EXACT HEX VALUES)
   - Background color - sample exact hex from reference
   - Text colors - primary, secondary, muted
   - Link colors
   - Divider/border colors

3. SPACING (EXACT PIXELS)
   - Top padding of footer
   - Bottom padding of footer
   - Side padding
   - Gap between logo and content below
   - Gap between sections
   - Gap between social icons

4. TYPOGRAPHY
   - Font sizes (measure carefully)
   - Font weights (400, 500, 600, 700)
   - Line heights
   - Letter spacing if visible

5. LOGO
   - Is it an <img> tag (NOT text)?
   - Correct size (width/height)
   - Centered properly

6. SOCIAL ICONS
   - Correct size (usually 24-40px)
   - Correct spacing between icons
   - Correct order

7. LEGAL/DISCLAIMER
   - Font size (usually 10-12px)
   - Color (usually muted gray)
   - Line height

For EACH discrepancy found, provide:
- Element with issue
- Current value
- Required value (exact pixel or hex)

CRITICAL: Only respond with "MATCH_GOOD" if >98% pixel-perfect.
If ANY visible discrepancies exist, list ALL with specific fixes.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      referenceImageUrl, 
      logoUrl, 
      lightLogoUrl,
      darkLogoUrl,
      socialIcons, 
      brandName, 
      brandColors 
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Set up SSE streaming
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendEvent = async (data: object) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    // Start processing in background
    (async () => {
      try {
        // Determine which logo to use based on background luminance
        // For dark backgrounds (most common in footers), use light logo
        const effectiveLogoUrl = logoUrl || lightLogoUrl || darkLogoUrl;
        
        // Build social icons description with exact URLs
        const socialIconsDescription = socialIcons?.length 
          ? `Social icons to include (use these EXACT URLs as <img> tags with 32x32px dimensions):
${socialIcons.map((s: any) => `- ${s.platform}: 
  - Link to: ${s.url}
  - Icon image URL (MUST USE): ${s.iconUrl}`).join('\n')}`
          : 'No social icons provided.';

        // Build color palette
        const colorPalette = brandColors 
          ? `Brand colors (use these EXACT hex values):
- Primary: ${brandColors.primary || '#ffffff'}
- Secondary: ${brandColors.secondary || '#888888'}
- Accent: ${brandColors.accent || 'none'}
- Background: ${brandColors.background || '#111111'}
- Text Primary: ${brandColors.textPrimary || '#ffffff'}
- Link: ${brandColors.link || brandColors.primary || '#ffffff'}`
          : 'Use dark background (#111111) with white text (#ffffff)';

        let userPrompt = `Create an email footer for "${brandName || 'Brand'}" with these specifications:

## LOGO (CRITICAL - MUST USE AS <img> TAG)
${effectiveLogoUrl 
  ? `Logo URL: ${effectiveLogoUrl}
You MUST use this exact URL in an <img> tag. NEVER render the brand name as text.
Example: <img src="${effectiveLogoUrl}" alt="${brandName || 'Logo'}" width="180" height="40" style="display: block; border: 0;">`
  : 'No logo provided - skip logo section entirely'}

## SOCIAL ICONS
${socialIconsDescription}

## COLORS
${colorPalette}

## REQUIREMENTS
- Total width: exactly 600px
- Table-based layout only (NO div, NO flexbox, NO float)
- All styles inline
- Include MSO conditionals for Outlook
- All images need width, height, alt, style="display:block; border:0;"
`;

        if (referenceImageUrl) {
          userPrompt += `
## REFERENCE IMAGE PROVIDED
CRITICAL: Match the reference image PIXEL-PERFECTLY:
1. Study the reference carefully - measure spacing, colors, typography
2. Match exact background color (sample hex value from image)
3. Match exact padding/spacing (measure in pixels)
4. Match exact typography (font sizes, weights, colors)
5. Match social icon size and spacing exactly
6. Match overall proportions and visual balance
7. BUT: Always use the provided logo URL as <img>, not text
`;
        } else {
          userPrompt += `
## NO REFERENCE IMAGE
Create a professional dark footer with:
- Dark background (use brand background color or #111111)
- Light text (#ffffff or #e5e5e5)
- Centered layout
- Logo at top (if provided)
- Social icons in a row
- Legal text at bottom
`;
        }

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
        
        content.push({ type: 'text', text: userPrompt });

        console.log('Generating footer for:', brandName, {
          hasReference: !!referenceImageUrl,
          hasLogo: !!effectiveLogoUrl,
          socialIconsCount: socialIcons?.length || 0
        });
        
        await sendEvent({ status: 'generating', message: 'Analyzing design and generating footer...' });

        // PHASE 1: Initial Generation
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
            messages: [{ role: 'user', content }],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Anthropic API error:', response.status, errorText);
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        let html = data.content?.[0]?.text || '';
        html = html.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

        console.log('Initial footer generated, length:', html.length);
        await sendEvent({ status: 'generated', message: 'Initial footer generated' });

        let iterations = 0;
        let matchAchieved = false;

        // PHASE 2: Auto-refinement loop (only if reference image provided)
        if (referenceImageUrl) {
          const MAX_REFINEMENTS = 2;
          let lastValidationIssue = '';
          
          for (let i = 0; i < MAX_REFINEMENTS; i++) {
            iterations = i + 1;
            console.log(`Auto-refinement iteration ${iterations}/${MAX_REFINEMENTS}`);
            await sendEvent({ 
              status: 'validating', 
              iteration: iterations, 
              maxIterations: MAX_REFINEMENTS,
              message: `Validating against reference (${iterations}/${MAX_REFINEMENTS})...` 
            });
            
            // Validate current HTML against reference
            const validateContent: any[] = [
              {
                type: 'image',
                source: { type: 'url', url: referenceImageUrl },
              },
              {
                type: 'text',
                text: `Reference image is shown above. Here is the generated HTML:

${html}

Perform STRICT pixel-perfect validation:
1. Compare colors - are hex values exact matches?
2. Compare spacing - are pixel values correct?
3. Compare typography - font sizes, weights, colors?
4. Compare layout - alignment, structure?
5. Is logo an <img> tag (this is correct, don't flag as error)?
6. Social icons - correct size (32x32) and spacing?

List ALL discrepancies with exact fixes needed.
Only respond with "MATCH_GOOD" if >98% perfect.`,
              },
            ];

            const validateResponse = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                system: VALIDATION_PROMPT,
                messages: [{ role: 'user', content: validateContent }],
              }),
            });

            if (!validateResponse.ok) {
              console.error('Validation API error, skipping refinement');
              break;
            }

            const validateData = await validateResponse.json();
            const validationResult = validateData.content?.[0]?.text || '';

            if (validationResult.includes('MATCH_GOOD')) {
              console.log('Validation passed - footer matches reference');
              matchAchieved = true;
              await sendEvent({ status: 'matched', message: 'Pixel-perfect match achieved!' });
              break;
            }

            // Early exit if same issue found twice
            const issueHash = validationResult.substring(0, 200);
            if (issueHash === lastValidationIssue) {
              console.log('Same issues found twice, stopping refinement');
              await sendEvent({ status: 'stopped', message: 'Refinement complete' });
              break;
            }
            lastValidationIssue = issueHash;

            console.log('Discrepancies found, refining...');
            await sendEvent({ 
              status: 'refining', 
              iteration: iterations, 
              maxIterations: MAX_REFINEMENTS,
              message: `Applying refinements (${iterations}/${MAX_REFINEMENTS})...` 
            });
            
            // Refine based on validation feedback
            const refineContent: any[] = [
              {
                type: 'image',
                source: { type: 'url', url: referenceImageUrl },
              },
              {
                type: 'text',
                text: `Current HTML:

${html}

Issues that MUST be fixed:
${validationResult}

${effectiveLogoUrl ? `REMINDER: Logo MUST be <img src="${effectiveLogoUrl}" ...> - NEVER text` : ''}

Fix ALL issues to achieve pixel-perfect match. Return only the corrected HTML.`,
              },
            ];

            const refineResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
                messages: [{ role: 'user', content: refineContent }],
              }),
            });

            if (!refineResponse.ok) {
              console.error('Refinement API error, using current HTML');
              break;
            }

            const refineData = await refineResponse.json();
            const refinedHtml = refineData.content?.[0]?.text || '';
            
            if (refinedHtml) {
              html = refinedHtml.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
              console.log(`Refinement ${iterations} complete`);
            }
          }
        }

        console.log('Footer generation complete', { iterations, matchAchieved });
        
        await sendEvent({ 
          status: 'complete', 
          html, 
          iterations, 
          matchAchieved,
          message: matchAchieved ? 'Footer generated with pixel-perfect match!' : 'Footer generated. You can refine via chat.'
        });
        
      } catch (error) {
        console.error('Error in stream:', error);
        await sendEvent({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Failed to generate footer' 
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error generating footer:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to generate footer' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
