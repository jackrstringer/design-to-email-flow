// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const REFERENCE_HTML_EXAMPLE = `
<!-- REFERENCE: This is an example of high-quality email HTML you should match -->
<tr>
    <td style="padding: 32px 5% 24px 5%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 17px; line-height: 26px; color: #333333; background-color: #ffffff;">
        You will need to schedule your appointment within the next 24 hours. You can do so by completing the form below.
    </td>
</tr>

<!-- CTA Button - Note the full-width table pattern -->
<tr>
    <td style="padding: 0 5% 24px 5%; background-color: #ffffff;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="background-color: #1904FF;">
                    <a href="https://example.com" style="display: block; padding: 18px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">BUTTON TEXT HERE</a>
                </td>
            </tr>
        </table>
    </td>
</tr>

<!-- Multi-paragraph text with signature -->
<tr>
    <td style="padding: 0 5% 32px 5%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 17px; line-height: 26px; color: #333333; background-color: #ffffff;">
        If you need any assistance, feel free to reply to this email.<br/><br/>
        Thank you for choosing us.<br/><br/>
        Best regards,<br/>
        <span style="font-weight: 600; color: #000000;">Team Name</span>
    </td>
</tr>
`;

interface FigmaDesignData {
  colors: string[];
  fonts: Array<{ family: string; size: number; weight: number; lineHeight: number }>;
  texts: Array<{ content: string; isUrl: boolean }>;
  spacing: { paddings: number[]; gaps: number[] };
}

function buildHtmlEmailRules(figmaData?: FigmaDesignData): string {
  // If we have Figma data, use exact measurements
  if (figmaData && figmaData.colors.length > 0) {
    const primaryFont = figmaData.fonts[0];
    const bodyFont = figmaData.fonts.find(f => f.size >= 14 && f.size <= 18) || primaryFont;
    const buttonFont = figmaData.fonts.find(f => f.weight >= 600) || primaryFont;
    
    // Find likely background and text colors
    const lightColors = figmaData.colors.filter(c => {
      const hex = c.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      return (r + g + b) / 3 > 200;
    });
    const darkColors = figmaData.colors.filter(c => {
      const hex = c.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      return (r + g + b) / 3 < 100;
    });
    const accentColors = figmaData.colors.filter(c => !lightColors.includes(c) && !darkColors.includes(c));

    return `
# HTML Email Building Rules - USE EXACT FIGMA MEASUREMENTS

## EXACT COLORS FROM DESIGN (use these hex values):
${figmaData.colors.map(c => `- ${c}`).join('\n')}

Likely usage:
- Background: ${lightColors[0] || '#ffffff'}
- Text: ${darkColors[0] || '#333333'}
- CTA/Accent: ${accentColors[0] || figmaData.colors[0] || '#1904FF'}

## EXACT FONTS FROM DESIGN:
${figmaData.fonts.map(f => `- ${f.family}, ${f.size}px, weight ${f.weight}, line-height ${Math.round(f.lineHeight)}px`).join('\n')}

Primary body text: font-size: ${bodyFont?.size || 17}px; line-height: ${Math.round(bodyFont?.lineHeight || 26)}px;
Button text: font-size: ${buttonFont?.size || 16}px; font-weight: ${buttonFont?.weight || 600};

## EXACT SPACING FROM DESIGN:
- Paddings used: ${figmaData.spacing.paddings.join('px, ') || '32'}px
- Gaps used: ${figmaData.spacing.gaps.join('px, ') || '24'}px

## Font Stack (use this for all text):
font-family: ${primaryFont?.family ? `'${primaryFont.family}', ` : ''}-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;

## REFERENCE EXAMPLE - Match this structure:
${REFERENCE_HTML_EXAMPLE}

## Structure Rules
1. Use ONLY tables for layout - never use divs, flexbox, or grid
2. All CSS must be inline - no external stylesheets or <style> blocks
3. All tables must have: border="0" cellpadding="0" cellspacing="0"
4. Content width should be 100% (parent container handles max-width)

## CTA Button Pattern (ALWAYS use this exact pattern for buttons):
<tr>
    <td style="padding: 0 5% 24px 5%; background-color: ${lightColors[0] || '#ffffff'};">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="background-color: ${accentColors[0] || '#1904FF'};">
                    <a href="LINK_URL" style="display: block; padding: 18px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: ${buttonFont?.size || 16}px; font-weight: ${buttonFont?.weight || 600}; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">BUTTON TEXT</a>
                </td>
            </tr>
        </table>
    </td>
</tr>

## DO NOT USE:
- JavaScript
- External CSS files or @import
- Google Fonts or custom fonts
- CSS position, float, flexbox, or grid
- box-shadow
- Forms or input elements
- Centered buttons with fixed width (always use full-width pattern)

## Output Format
Return ONLY the raw HTML code - no markdown, no explanation, no code fences.
The HTML should be table rows that can be inserted directly into an email template.
`;
  }

  // Fallback to default rules
  return `
# HTML Email Building Rules - MATCH THE ORIGINAL DESIGN EXACTLY

## CRITICAL STYLE SPECIFICATIONS (use these exact values):
- **Body text**: font-size: 17px; line-height: 26px; color: #333333;
- **Font stack**: font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
- **Horizontal padding**: Always use 5% (e.g., padding: 32px 5% 24px 5%;)
- **Emphasized text**: font-weight: 600; color: #000000;
- **CTA buttons**: FULL WIDTH, background-color: #1904FF (or match the design), padding: 18px 20px; font-size: 16px; font-weight: 600; color: #ffffff; letter-spacing: 0.5px;
- **Background**: background-color: #ffffff; (or match the design)

## REFERENCE EXAMPLE - Match this quality and style:
${REFERENCE_HTML_EXAMPLE}

## Structure Rules
1. Use ONLY tables for layout - never use divs, flexbox, or grid
2. All CSS must be inline - no external stylesheets or <style> blocks
3. All tables must have: border="0" cellpadding="0" cellspacing="0"
4. Content width should be 100% (parent container handles max-width)

## CTA Button Pattern (ALWAYS use this exact pattern for buttons):
<tr>
    <td style="padding: 0 5% 24px 5%; background-color: #ffffff;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="background-color: #BUTTON_COLOR;">
                    <a href="LINK_URL" style="display: block; padding: 18px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">BUTTON TEXT</a>
                </td>
            </tr>
        </table>
    </td>
</tr>

## Text Spacing Guidelines:
- Top padding after images: 32px
- Between paragraphs: Use <br/><br/> within a single <td>
- Bottom padding before buttons: 24px
- Bottom padding after content sections: 32px

## DO NOT USE:
- JavaScript
- External CSS files or @import
- Google Fonts or custom fonts
- CSS position, float, flexbox, or grid
- box-shadow
- Forms or input elements
- Centered buttons with fixed width (always use full-width pattern)

## Output Format
Return ONLY the raw HTML code - no markdown, no explanation, no code fences.
The HTML should be table rows that can be inserted directly into an email template.
`;
}

async function generateHtml(
  sliceDataUrl: string, 
  brandUrl: string, 
  sliceIndex: number, 
  totalSlices: number, 
  apiKey: string,
  figmaData?: FigmaDesignData
): Promise<string> {
  const htmlRules = buildHtmlEmailRules(figmaData);
  
  const figmaContext = figmaData ? `
IMPORTANT: You have access to EXACT design measurements from Figma:
- Use the exact hex colors provided
- Use the exact font sizes and weights provided
- Use the exact spacing values provided
Do NOT guess - use the values from the design data.
` : '';

  const prompt = `You are an expert HTML email developer. Convert this email design section into flawless HTML email code that EXACTLY matches the visual design.

${htmlRules}

${figmaContext}

CONTEXT:
- This is slice ${sliceIndex + 1} of ${totalSlices} from an email campaign
- Brand website: ${brandUrl || 'Not specified'}
- This slice needs to be converted to pure HTML (not an image)

ANALYZE THE IMAGE CAREFULLY AND:
1. Identify all text content - copy it EXACTLY as shown
2. Match colors PRECISELY - use exact hex values from the design${figmaData ? ' (provided above)' : ''}
3. Match spacing EXACTLY - use the padding values from my specifications
4. For CTAs/buttons: Use the FULL-WIDTH button pattern I provided
5. Match typography - font sizes, weights, and line heights${figmaData ? ' (use exact values provided)' : ''}

CRITICAL: The generated HTML must look IDENTICAL to the original image. Pay attention to:
- Button width (should be full-width, not centered/narrow)
- Text alignment and line spacing
- Padding and margins
- Color accuracy

Return ONLY the HTML code - no explanation, no markdown code fences, just raw HTML.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
  
  // Clean up the response
  htmlContent = htmlContent
    .replace(/^```html?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  return htmlContent;
}

async function validateHtml(originalImageUrl: string, generatedHtml: string, apiKey: string): Promise<{ approved: boolean; corrections: string }> {
  console.log('Validating generated HTML against original design...');
  
  const validationPrompt = `You are a quality assurance expert for HTML emails. Compare the original design image with the HTML code provided.

ORIGINAL DESIGN: See the attached image

GENERATED HTML:
${generatedHtml}

Analyze the HTML and determine if it would render to match the original design. Check for:
1. Button styling - Is the button full-width or incorrectly narrow/centered?
2. Text content - Is all text captured correctly?
3. Spacing - Are paddings and margins appropriate?
4. Colors - Are colors matching (especially button colors)?
5. Typography - Font sizes and weights correct?

If the HTML would render correctly matching the design, respond with exactly: APPROVED

If there are issues, respond with specific corrections needed in this format:
CORRECTIONS:
- [Issue 1]: [Specific fix needed]
- [Issue 2]: [Specific fix needed]

Be strict about button width - buttons should be full-width using width="100%" on the table, not narrow centered buttons.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: validationPrompt },
            { type: 'image_url', image_url: { url: originalImageUrl } }
          ]
        }
      ],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    console.error('Validation API error, skipping validation');
    return { approved: true, corrections: '' };
  }

  const aiResponse = await response.json();
  const validationResult = aiResponse.choices?.[0]?.message?.content || '';
  
  console.log('Validation result:', validationResult);

  if (validationResult.trim().toUpperCase().includes('APPROVED')) {
    return { approved: true, corrections: '' };
  }

  return { approved: false, corrections: validationResult };
}

async function regenerateWithCorrections(
  sliceDataUrl: string, 
  previousHtml: string, 
  corrections: string, 
  brandUrl: string,
  sliceIndex: number,
  totalSlices: number,
  apiKey: string,
  figmaData?: FigmaDesignData
): Promise<string> {
  console.log('Regenerating HTML with corrections...');
  
  const htmlRules = buildHtmlEmailRules(figmaData);

  const prompt = `You are an expert HTML email developer. Your previous HTML generation had issues. Fix them and regenerate.

PREVIOUS HTML (has issues):
${previousHtml}

CORRECTIONS NEEDED:
${corrections}

${htmlRules}

CONTEXT:
- This is slice ${sliceIndex + 1} of ${totalSlices} from an email campaign
- Brand website: ${brandUrl || 'Not specified'}

Look at the original image again and apply the corrections. Pay special attention to:
- Making buttons FULL-WIDTH using the table pattern with width="100%"
- Matching exact colors and spacing${figmaData ? ' (use the exact values from Figma provided above)' : ''}
- Using proper padding values (5% horizontal, 32px/24px vertical)

Return ONLY the corrected HTML code - no explanation, no markdown code fences.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
    console.error('Regeneration failed, returning previous HTML');
    return previousHtml;
  }

  const aiResponse = await response.json();
  let htmlContent = aiResponse.choices?.[0]?.message?.content || previousHtml;
  
  htmlContent = htmlContent
    .replace(/^```html?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  return htmlContent;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sliceDataUrl, brandUrl, sliceIndex, totalSlices, figmaDesignData } = await req.json();

    if (!sliceDataUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing sliceDataUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating HTML for slice ${sliceIndex + 1} of ${totalSlices}`);
    if (figmaDesignData) {
      console.log('Using Figma design data for exact measurements');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Phase 1: Generate initial HTML (with Figma data if available)
    let htmlContent = await generateHtml(sliceDataUrl, brandUrl, sliceIndex, totalSlices, LOVABLE_API_KEY, figmaDesignData);
    console.log('Initial HTML generated');

    // Phase 2: Validate and refine (max 2 iterations)
    const MAX_ITERATIONS = 2;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const validation = await validateHtml(sliceDataUrl, htmlContent, LOVABLE_API_KEY);
      
      if (validation.approved) {
        console.log(`HTML approved after ${i} correction iterations`);
        break;
      }

      console.log(`Iteration ${i + 1}: Corrections needed`);
      htmlContent = await regenerateWithCorrections(
        sliceDataUrl,
        htmlContent,
        validation.corrections,
        brandUrl,
        sliceIndex,
        totalSlices,
        LOVABLE_API_KEY,
        figmaDesignData
      );
    }

    console.log('HTML generation complete');

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
