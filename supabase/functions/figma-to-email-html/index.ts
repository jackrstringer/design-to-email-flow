import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SocialIcon {
  platform: string;
  url: string;
  iconUrl: string;
}

interface BrandColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  textPrimary?: string;
  link?: string;
}

interface DesignData {
  colors: string[];
  fonts: Array<{ family: string; size: number; weight: number; lineHeight: number }>;
  texts: Array<{ content: string; isUrl: boolean }>;
  spacing: { paddings: number[]; gaps: number[] };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      design,
      designData,
      exportedImageUrl,
      lightLogoUrl,
      darkLogoUrl,
      socialIcons,
      websiteUrl,
      brandName,
      allLinks,
      brandColors,
    } = await req.json();
    
    if (!exportedImageUrl) {
      return new Response(
        JSON.stringify({ error: 'exportedImageUrl is required for AI analysis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the deterministic prompt with exact Figma values
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      designData,
      design,
      lightLogoUrl,
      darkLogoUrl,
      socialIcons,
      websiteUrl,
      brandName,
      allLinks,
      brandColors,
    });

    console.log('Calling Claude with EXACT Figma specifications...');
    console.log('Design data:', JSON.stringify(designData, null, 2));

    // Build messages array with images
    const messages: any[] = [
      {
        role: 'user',
        content: [],
      },
    ];

    // Show logos to Claude first so it knows what they look like
    if (darkLogoUrl) {
      messages[0].content.push(
        { type: 'text', text: 'DARK LOGO IMAGE (use on light backgrounds):' },
        { type: 'image', source: { type: 'url', url: darkLogoUrl } }
      );
    }

    if (lightLogoUrl) {
      messages[0].content.push(
        { type: 'text', text: 'LIGHT LOGO IMAGE (use on dark backgrounds):' },
        { type: 'image', source: { type: 'url', url: lightLogoUrl } }
      );
    }

    // Add the Figma design image
    messages[0].content.push(
      { type: 'text', text: 'FIGMA DESIGN TO REPLICATE:' },
      { type: 'image', source: { type: 'url', url: exportedImageUrl } }
    );

    // Add the detailed prompt
    messages[0].content.push({ type: 'text', text: userPrompt });

    // Initial generation
    let html = await callClaude(ANTHROPIC_API_KEY, systemPrompt, messages);

    if (!html || html.length < 100) {
      throw new Error('Claude did not return valid HTML');
    }

    // Validation loop - compare generated HTML to reference and refine
    const maxIterations = 3;
    for (let i = 0; i < maxIterations; i++) {
      console.log(`Validation iteration ${i + 1}/${maxIterations}...`);
      
      const validationResult = await validateHtml(
        ANTHROPIC_API_KEY,
        html,
        exportedImageUrl,
        designData
      );

      if (validationResult.matches) {
        console.log('HTML matches reference design - validation passed!');
        break;
      }

      console.log('Discrepancies found:', validationResult.discrepancies);

      // Refine with specific corrections
      html = await refineHtml(
        ANTHROPIC_API_KEY,
        html,
        exportedImageUrl,
        validationResult.discrepancies,
        designData
      );
    }

    console.log('Successfully generated pixel-perfect HTML from Figma');

    return new Response(
      JSON.stringify({
        success: true,
        html,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in figma-to-email-html:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function callClaude(apiKey: string, systemPrompt: string, messages: any[]): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude API error:', response.status, errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const responseText = data.content?.[0]?.text || '';

  // Extract HTML from response
  const htmlMatch = responseText.match(/```html\n([\s\S]*?)\n```/);
  return htmlMatch ? htmlMatch[1] : responseText;
}

async function validateHtml(
  apiKey: string,
  html: string,
  referenceImageUrl: string,
  designData: DesignData | null
): Promise<{ matches: boolean; discrepancies: string[] }> {
  const prompt = `Compare this generated HTML against the reference Figma design.

EXACT SPECIFICATIONS FROM FIGMA:
${designData ? `
- Colors: ${designData.colors.join(', ')}
- Font sizes: ${designData.fonts.map(f => `${f.size}px`).join(', ')}
- Font weights: ${designData.fonts.map(f => f.weight).join(', ')}
- Line heights: ${designData.fonts.map(f => `${f.lineHeight}px`).join(', ')}
- Paddings: ${designData.spacing.paddings.join('px, ')}px
- Gaps: ${designData.spacing.gaps.join('px, ')}px
` : 'No exact specifications available'}

GENERATED HTML:
\`\`\`html
${html}
\`\`\`

Check for these specific issues:
1. Background colors match exactly (check hex values)
2. Font sizes match exactly (e.g., if Figma says 14px, HTML must be 14px)
3. Padding/spacing values match exactly
4. Font weights match (400, 500, 600, 700, etc.)
5. Text colors match exactly
6. Layout structure matches (horizontal vs vertical alignment)

Respond with JSON:
{
  "matches": true/false,
  "discrepancies": ["specific issue 1", "specific issue 2", ...]
}

If matches is true, discrepancies should be empty.
Be VERY strict - even 1px difference or slightly wrong color is a discrepancy.`;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: referenceImageUrl } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages,
    }),
  });

  if (!response.ok) {
    console.error('Validation API error');
    return { matches: false, discrepancies: ['Validation API error'] };
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*"matches"[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse validation response:', e);
  }

  return { matches: false, discrepancies: ['Failed to validate'] };
}

async function refineHtml(
  apiKey: string,
  currentHtml: string,
  referenceImageUrl: string,
  discrepancies: string[],
  designData: DesignData | null
): Promise<string> {
  const prompt = `Fix these specific issues in the HTML to match the Figma design exactly:

ISSUES TO FIX:
${discrepancies.map((d, i) => `${i + 1}. ${d}`).join('\n')}

EXACT VALUES TO USE (from Figma):
${designData ? `
- Colors: ${designData.colors.join(', ')}
- Font sizes: ${designData.fonts.map(f => `${f.size}px (weight ${f.weight}, line-height ${f.lineHeight}px)`).join(', ')}
- Paddings: ${designData.spacing.paddings.join('px, ')}px
- Gaps between elements: ${designData.spacing.gaps.join('px, ')}px
` : 'Use values from the reference image'}

CURRENT HTML:
\`\`\`html
${currentHtml}
\`\`\`

Apply the EXACT corrections needed. Do not guess - use the precise values listed above.
Return ONLY the corrected HTML wrapped in \`\`\`html code blocks.`;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: referenceImageUrl } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  return await callClaude(apiKey, buildSystemPrompt(), messages);
}

function buildSystemPrompt(): string {
  return `You are an expert email HTML developer creating PIXEL-PERFECT email templates from Figma designs.

## ABSOLUTE RULES - NO EXCEPTIONS

### USE EXACT VALUES - NO GUESSING
- If Figma says font-size is 14px, use EXACTLY 14px
- If Figma says padding is 24px, use EXACTLY 24px  
- If Figma says color is #1A1A1A, use EXACTLY #1A1A1A
- NEVER round, estimate, or use "similar" values

### EMAIL-SAFE HTML REQUIREMENTS
- Use ONLY tables with role="presentation" for layout
- ALL styles must be inline (no <style> blocks for critical styles)
- All tables: cellpadding="0" cellspacing="0" border="0"
- Images: width/height attributes, style="display: block; border: 0;"
- Web-safe fonts: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif

### PROHIBITED
- NO div elements for layout
- NO margin CSS property (use padding only)
- NO float or display: flex
- NO unitless values

### STRUCTURE
Two-table nesting:
- Outer table: width="100%" with white background (#ffffff)
- Inner table: width="600" max-width="600px" with content background

### LOGO HANDLING
- Use <img> tags with EXACT logo URLs provided
- Logo centered with max-width constraint
- height="auto" for aspect ratio

### SOCIAL ICONS
- Use EXACT iconUrl values provided
- Wrap in <a> tag with platform URL
- 24x24 size`;
}

interface PromptData {
  designData: DesignData | null;
  design: any;
  lightLogoUrl?: string;
  darkLogoUrl?: string;
  socialIcons?: SocialIcon[];
  websiteUrl?: string;
  brandName?: string;
  allLinks?: string[];
  brandColors?: BrandColors;
}

function buildUserPrompt(data: PromptData): string {
  const {
    designData,
    design,
    lightLogoUrl,
    darkLogoUrl,
    socialIcons,
    websiteUrl,
    brandName,
    allLinks,
    brandColors,
  } = data;

  let prompt = `Generate email-safe HTML that matches the Figma footer design EXACTLY.

## EXACT SPECIFICATIONS FROM FIGMA (USE THESE VALUES - NO GUESSING)
`;

  if (designData) {
    prompt += `
### COLORS (exact hex values - copy these exactly)
${designData.colors.map(c => `- ${c}`).join('\n')}

### TYPOGRAPHY (exact pixel values - do not round)
${designData.fonts.map(f => 
  `- Font: ${f.family}, Size: ${f.size}px, Weight: ${f.weight}, Line-height: ${f.lineHeight}px`
).join('\n')}

### SPACING (exact pixel values - do not round)
- Paddings used in design: ${designData.spacing.paddings.length > 0 ? designData.spacing.paddings.join('px, ') + 'px' : 'none detected'}
- Gaps between elements: ${designData.spacing.gaps.length > 0 ? designData.spacing.gaps.join('px, ') + 'px' : 'none detected'}

### TEXT CONTENT FROM FIGMA
${designData.texts.slice(0, 30).map(t => `- "${t.content}"${t.isUrl ? ' (URL)' : ''}`).join('\n')}
`;
  } else {
    prompt += `
No exact specifications provided - analyze the reference image carefully.
`;
  }

  // Add design dimensions if available
  if (design?.width || design?.height) {
    prompt += `
### DIMENSIONS
- Width: ${design.width}px
- Height: ${design.height}px
`;
  }

  prompt += `
## BRAND CONTEXT
- Brand Name: ${brandName || 'Unknown'}
- Website: ${websiteUrl || 'https://example.com'}

## LOGOS (use these EXACT URLs in <img> tags)
${lightLogoUrl ? `Light logo (for dark backgrounds): ${lightLogoUrl}` : 'No light logo'}
${darkLogoUrl ? `Dark logo (for light backgrounds): ${darkLogoUrl}` : 'No dark logo'}

CRITICAL: Use <img src="..."> with the EXACT logo URL. Do NOT render brand name as text.
`;

  if (socialIcons && socialIcons.length > 0) {
    prompt += `
## SOCIAL ICONS (use these EXACT URLs)
${socialIcons.map(icon => `- ${icon.platform}: href="${icon.url}" src="${icon.iconUrl}"`).join('\n')}
`;
  }

  if (allLinks && allLinks.length > 0) {
    prompt += `
## AVAILABLE LINKS (match navigation text to these URLs)
${allLinks.slice(0, 20).map(link => `- ${link}`).join('\n')}
`;
  }

  prompt += `
## CRITICAL INSTRUCTIONS
1. Use the EXACT color hex values listed above
2. Use the EXACT font sizes listed above (do not round 14px to 16px)
3. Use the EXACT padding/gap values listed above
4. Match the visual layout EXACTLY as shown in the reference image
5. Every measurement must be PRECISE - this is not an approximation

Return ONLY the complete HTML wrapped in \`\`\`html code blocks.`;

  return prompt;
}
