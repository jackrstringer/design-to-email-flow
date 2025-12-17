import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_FOOTER_RULES = `
You are an expert email developer creating a branded footer for email campaigns.
Your goal is to create HTML that EXACTLY matches the reference image provided.

CRITICAL REQUIREMENTS:
1. Use table-based layout (not flexbox/grid) for email compatibility
2. All styles must be inline (no external CSS except for dark mode media query in <style> tag)
3. Total width must be exactly 600px
4. Use web-safe fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif
5. Social icons must be <img> tags with the provided iconUrl, 32x32px size
6. Logo should be centered with appropriate max-width (match reference)
7. Include dark mode support via @media (prefers-color-scheme: dark) in a <style> tag

WHEN REFERENCE IMAGE IS PROVIDED:
- Study the reference image PIXEL BY PIXEL
- Match the EXACT layout structure (what sections, in what order)
- Match the EXACT colors (background color, text colors, link colors)
- Match the EXACT spacing (padding top/bottom, gaps between elements)
- Match the EXACT typography (font sizes, weights, line heights)
- Match the logo size and positioning relative to other elements
- Match the social icon arrangement (spacing, alignment)
- Match any navigation links or text sections

OUTPUT STRUCTURE:
- Wrap everything in a <tr> element (it will be inserted into an existing table)
- Use proper <td> cells with explicit widths and padding
- Include a <style> block for dark mode only if needed

Return ONLY the HTML code, no explanation or markdown.
`;

const VALIDATION_PROMPT = `
You are validating generated HTML against a reference image.

Compare the HTML (which would render as an email footer) to the reference image.
List specific discrepancies in these categories:
1. LAYOUT: Section order, alignment issues
2. COLORS: Wrong background, text, or link colors (specify exact hex values needed)
3. SPACING: Incorrect padding, margins, or gaps (specify pixel values)
4. TYPOGRAPHY: Wrong font sizes, weights, or line heights
5. SIZING: Logo or icon dimensions don't match
6. MISSING: Elements in reference but not in HTML

For each issue, provide the SPECIFIC fix needed with exact values.

If the HTML is a close match (>90% accurate), respond with just: "MATCH_GOOD"
Otherwise, list the issues in a structured format.
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
      ? `Social icons to include:\n${socialIcons.map((s: any) => `- ${s.platform}: URL=${s.url}, Icon=${s.iconUrl}`).join('\n')}`
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

${logoUrl ? `Logo URL: ${logoUrl}` : 'No logo provided - skip logo section'}

${socialIconsDescription}

${colorPalette}

`;

    if (referenceImageUrl) {
      userPrompt += `
IMPORTANT: A reference image is provided. You MUST match this reference EXACTLY:
- Copy the exact layout structure you see
- Match all colors precisely (sample hex values from the image)
- Match all spacing and proportions
- Match typography sizes and weights
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

    // PHASE 2: Auto-refinement loop (only if reference image provided)
    if (referenceImageUrl) {
      const MAX_REFINEMENTS = 2;
      
      for (let i = 0; i < MAX_REFINEMENTS; i++) {
        console.log(`Auto-refinement iteration ${i + 1}/${MAX_REFINEMENTS}`);
        
        // Validate current HTML against reference
        const validateContent: any[] = [
          {
            type: 'image',
            source: { type: 'url', url: referenceImageUrl },
          },
          {
            type: 'text',
            text: `Reference image is shown above. Here is the generated HTML:\n\n${html}\n\nCompare what this HTML would render as to the reference image. List any discrepancies or respond with "MATCH_GOOD" if it's close enough.`,
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
          break;
        }

        console.log('Discrepancies found, refining...');
        
        // Refine based on validation feedback
        const refineContent: any[] = [
          {
            type: 'image',
            source: { type: 'url', url: referenceImageUrl },
          },
          {
            type: 'text',
            text: `Current HTML:\n\n${html}\n\nIssues identified:\n${validationResult}\n\nFix ALL these issues to match the reference image exactly. Return only the corrected HTML.`,
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
          console.log(`Refinement ${i + 1} complete`);
        }
      }
    }

    console.log('Footer generation complete');

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
