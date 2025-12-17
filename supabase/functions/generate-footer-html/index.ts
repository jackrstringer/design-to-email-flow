import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_FOOTER_RULES = `
You are an expert email developer creating a branded footer for email campaigns.
Your goal is to create HTML that is a PIXEL-PERFECT match of the reference image provided.

CRITICAL - LOGO HANDLING:
- If a Logo URL is provided, you MUST use it as an <img> tag
- NEVER render the brand name as text when a logo image URL is given
- The logo must be: <img src="{provided_logo_url}" alt="{brandName}" style="display:block; max-width:200px; height:auto; margin:0 auto;">
- Even if the reference image shows text as the logo, REPLACE it with the provided logo image URL
- This is NON-NEGOTIABLE - always use the logo image, never text

CRITICAL EMAIL REQUIREMENTS:
1. Use table-based layout (not flexbox/grid) for email compatibility
2. All styles must be inline (no external CSS except for dark mode media query in <style> tag)
3. Total width must be exactly 600px
4. Use web-safe fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif
5. Social icons must be <img> tags with the provided iconUrl, 32x32px size
6. Include dark mode support via @media (prefers-color-scheme: dark) in a <style> tag

PIXEL-PERFECT MATCHING REQUIREMENTS:
When a reference image is provided, you must match it EXACTLY:
- Study the reference image PIXEL BY PIXEL
- Match the EXACT layout structure (what sections, in what order)
- Match the EXACT colors (background color, text colors, link colors - sample hex values from the image)
- Match the EXACT spacing (padding top/bottom, gaps between elements - measure in pixels)
- Match the EXACT typography (font sizes, weights, line heights)
- Match the social icon arrangement (spacing, alignment, order)
- Match any navigation links or text sections EXACTLY
- Match the overall proportions and visual balance

OUTPUT STRUCTURE:
- Wrap everything in a <tr> element (it will be inserted into an existing table)
- Use proper <td> cells with explicit widths and padding
- Include a <style> block for dark mode only if needed

Return ONLY the HTML code, no explanation or markdown.
`;

const VALIDATION_PROMPT = `
You are performing STRICT validation of generated HTML against a reference image.
This validation must be EXTREMELY PRECISE - we need PIXEL-PERFECT matching.

Compare the HTML (which would render as an email footer) to the reference image.
Check these categories with EXTREME precision:

1. LOGO: Is the logo an <img> tag? Is it the correct size? Is it centered?
2. LAYOUT: Section order, alignment - is everything in EXACTLY the right position?
3. COLORS: Background, text, link colors - are they the EXACT hex values from the reference?
4. SPACING: Padding, margins, gaps - are they EXACTLY matching (within 5px tolerance)?
5. TYPOGRAPHY: Font sizes, weights, line heights - do they EXACTLY match?
6. SOCIAL ICONS: Correct size (32x32), correct spacing, correct alignment?
7. TEXT CONTENT: Does all text match the reference exactly?

For each discrepancy found, provide:
- The specific element with the issue
- The EXACT fix needed with precise pixel/hex values

CRITICAL: Only respond with "MATCH_GOOD" if the HTML is >98% pixel-perfect.
If there are ANY visible discrepancies, list them ALL with specific fixes.
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

    // Build the initial prompt
    const socialIconsDescription = socialIcons?.length 
      ? `Social icons to include (use these EXACT URLs as <img> tags):\n${socialIcons.map((s: any) => `- ${s.platform}: Link URL=${s.url}, Icon Image=${s.iconUrl}`).join('\n')}`
      : 'No social icons provided.';

    const colorPalette = brandColors 
      ? `Brand colors (use these EXACT hex values):
- Primary: ${brandColors.primary}
- Secondary: ${brandColors.secondary}
- Accent: ${brandColors.accent || 'none'}
- Background: ${brandColors.background || '#111111'}
- Text: ${brandColors.textPrimary || '#ffffff'}
- Link: ${brandColors.link || brandColors.primary || '#ffffff'}`
      : '';

    let userPrompt = `Create an email footer for "${brandName}" with these specifications:

${logoUrl ? `LOGO IMAGE URL (MUST USE AS <img> TAG, NOT TEXT): ${logoUrl}
CRITICAL: Use this exact URL in an <img> tag. Do NOT render the brand name as text.` : 'No logo provided - skip logo section'}

${socialIconsDescription}

${colorPalette}

`;

    if (referenceImageUrl) {
      userPrompt += `
IMPORTANT: A reference image is provided. You MUST match this reference PIXEL-PERFECTLY:
- Copy the exact layout structure you see
- Match all colors precisely (sample hex values from the image)
- Match all spacing and proportions (measure carefully)
- Match typography sizes and weights
- BUT ALWAYS use the provided logo URL as an <img> tag, not text
- This is your PRIMARY source of truth for the design
`;
    } else {
      userPrompt += `
The footer should have a dark background (use the brand background color or #111111) with light text.
Make it elegant and professional.`;
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

    console.log('Generating footer for:', brandName, referenceImageUrl ? '(with reference image)' : '(no reference)');

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

    console.log('Initial footer generated');

    let iterations = 0;
    let matchAchieved = false;

    // PHASE 2: Auto-refinement loop (only if reference image provided)
    if (referenceImageUrl) {
      const MAX_REFINEMENTS = 5;
      
      for (let i = 0; i < MAX_REFINEMENTS; i++) {
        iterations = i + 1;
        console.log(`Auto-refinement iteration ${iterations}/${MAX_REFINEMENTS}`);
        
        // Validate current HTML against reference
        const validateContent: any[] = [
          {
            type: 'image',
            source: { type: 'url', url: referenceImageUrl },
          },
          {
            type: 'text',
            text: `Reference image is shown above. Here is the generated HTML:\n\n${html}\n\nPerform STRICT validation. The HTML must be >98% pixel-perfect to pass. Check every detail: colors (exact hex), spacing (exact pixels), typography, logo (must be <img> tag not text), social icons. List ALL discrepancies or respond with "MATCH_GOOD" only if near-perfect.`,
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
          console.log('Validation passed - footer matches reference (pixel-perfect)');
          matchAchieved = true;
          break;
        }

        console.log('Discrepancies found, refining...', validationResult.substring(0, 200));
        
        // Refine based on validation feedback
        const refineContent: any[] = [
          {
            type: 'image',
            source: { type: 'url', url: referenceImageUrl },
          },
          {
            type: 'text',
            text: `Current HTML:\n\n${html}\n\nIssues identified that MUST be fixed:\n${validationResult}\n\n${logoUrl ? `REMINDER: The logo MUST be an <img> tag with src="${logoUrl}" - NEVER render as text.` : ''}\n\nFix ALL these issues to achieve PIXEL-PERFECT match with the reference image. Return only the corrected HTML.`,
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

    return new Response(
      JSON.stringify({ html, iterations, matchAchieved }),
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
