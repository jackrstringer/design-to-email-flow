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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      design,
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

    // Extract useful measurements from Figma design data
    const figmaMeasurements = extractFigmaMeasurements(design);

    // Build the AI prompt with Figma data + brand context
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      figmaMeasurements,
      lightLogoUrl,
      darkLogoUrl,
      socialIcons,
      websiteUrl,
      brandName,
      allLinks,
      brandColors,
    });

    console.log('Calling Claude with Figma design + brand context...');

    // Build messages array with image
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: exportedImageUrl,
            },
          },
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    ];

    // If we have logo URLs, show them to Claude as well
    if (lightLogoUrl) {
      messages[0].content.unshift({
        type: 'image',
        source: { type: 'url', url: lightLogoUrl },
      });
      messages[0].content.unshift({
        type: 'text',
        text: 'LIGHT LOGO IMAGE (use on dark backgrounds):',
      });
    }

    if (darkLogoUrl) {
      messages[0].content.unshift({
        type: 'image',
        source: { type: 'url', url: darkLogoUrl },
      });
      messages[0].content.unshift({
        type: 'text',
        text: 'DARK LOGO IMAGE (use on light backgrounds):',
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
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

    // Extract HTML from Claude's response
    const htmlMatch = responseText.match(/```html\n([\s\S]*?)\n```/);
    const html = htmlMatch ? htmlMatch[1] : responseText;

    if (!html || html.length < 100) {
      throw new Error('Claude did not return valid HTML');
    }

    console.log('Successfully generated HTML from Figma + AI');

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

function extractFigmaMeasurements(design: any): Record<string, any> {
  if (!design) return {};
  
  const measurements: Record<string, any> = {
    width: design.width,
    height: design.height,
    backgroundColor: design.backgroundColor,
    padding: design.padding,
    layoutMode: design.layoutMode,
    itemSpacing: design.itemSpacing,
  };

  // Extract typography from text nodes
  const textStyles: any[] = [];
  extractTextStyles(design, textStyles);
  if (textStyles.length > 0) {
    measurements.typography = textStyles;
  }

  // Extract colors used
  const colors = new Set<string>();
  extractColors(design, colors);
  measurements.colorsUsed = Array.from(colors);

  return measurements;
}

function extractTextStyles(node: any, styles: any[]) {
  if (node.type === 'TEXT' && node.fontFamily) {
    styles.push({
      text: node.text?.substring(0, 50),
      fontFamily: node.fontFamily,
      fontSize: node.fontSize,
      fontWeight: node.fontWeight,
      color: node.color,
      lineHeight: node.lineHeight,
    });
  }
  if (node.children) {
    for (const child of node.children) {
      extractTextStyles(child, styles);
    }
  }
}

function extractColors(node: any, colors: Set<string>) {
  if (node.backgroundColor) colors.add(node.backgroundColor);
  if (node.color) colors.add(node.color);
  if (node.borderColor) colors.add(node.borderColor);
  if (node.children) {
    for (const child of node.children) {
      extractColors(child, colors);
    }
  }
}

function buildSystemPrompt(): string {
  return `You are an expert email HTML developer. Your task is to create production-ready, email-safe HTML from a Figma design reference image.

## STRICT EMAIL HTML RULES

### REQUIRED:
- Use ONLY tables with role="presentation" for layout
- ALL styles must be inline (no <style> blocks for critical styles)
- All tables: cellpadding="0" cellspacing="0" border="0"
- Images: width/height attributes, style="display: block; border: 0;"
- Web-safe fonts: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif
- MSO conditionals for Outlook where needed

### PROHIBITED:
- NO div elements for layout
- NO margin CSS property (use padding only)
- NO float or display: flex
- NO unitless values

### STRUCTURE:
Use two-table nesting:
- Outer table: width="100%" with white background (#ffffff)
- Inner table: width="600" max-width="600px" with content background color

### LOGO HANDLING:
- Use <img> tags with the exact logo URLs provided
- Logo should be centered with max-width constraint
- Use height="auto" to maintain aspect ratio

### SOCIAL ICONS:
- Use the exact iconUrl values provided for each platform
- Wrap each icon in <a> tag with the platform URL
- Icons should be 24x24 or similar small size

### LINK ASSIGNMENT:
You must intelligently match navigation text to the correct URLs from the allLinks array.
For example:
- "Shop" → find URL containing /shop or /products
- "About" → find URL containing /about
- "Contact" → find URL containing /contact
- Use websiteUrl as fallback for unmatched items`;
}

interface PromptData {
  figmaMeasurements: Record<string, any>;
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
    figmaMeasurements,
    lightLogoUrl,
    darkLogoUrl,
    socialIcons,
    websiteUrl,
    brandName,
    allLinks,
    brandColors,
  } = data;

  let prompt = `Generate email-safe HTML that matches this Figma footer design exactly.

## FIGMA MEASUREMENTS
${JSON.stringify(figmaMeasurements, null, 2)}

## BRAND CONTEXT
- Brand Name: ${brandName || 'Unknown'}
- Website: ${websiteUrl || 'https://example.com'}

## AVAILABLE LOGOS
${lightLogoUrl ? `- Light logo (for dark backgrounds): ${lightLogoUrl}` : '- No light logo provided'}
${darkLogoUrl ? `- Dark logo (for light backgrounds): ${darkLogoUrl}` : '- No dark logo provided'}

Use the appropriate logo based on the footer's background color (if background is dark, use light logo).
CRITICAL: Use the EXACT logo URL in an <img> tag. Do NOT render the brand name as text.

Logo HTML example:
<img src="${lightLogoUrl || darkLogoUrl || ''}" alt="${brandName}" width="150" height="auto" style="display: block; border: 0; max-width: 150px; height: auto;" />`;

  if (socialIcons && socialIcons.length > 0) {
    prompt += `

## SOCIAL ICONS (use these exact URLs)
${socialIcons.map(icon => `- ${icon.platform}: link to ${icon.url}, icon image: ${icon.iconUrl}`).join('\n')}

Each social icon should be:
<a href="${socialIcons[0]?.url}" style="display: inline-block; margin: 0 8px;">
  <img src="${socialIcons[0]?.iconUrl}" alt="${socialIcons[0]?.platform}" width="24" height="24" style="display: block; border: 0;" />
</a>`;
  }

  if (allLinks && allLinks.length > 0) {
    prompt += `

## AVAILABLE BRAND LINKS (match nav items to these)
${allLinks.slice(0, 20).map(link => `- ${link}`).join('\n')}

Match navigation text in the design to the most appropriate URL above.`;
  }

  if (brandColors) {
    prompt += `

## BRAND COLORS (for reference)
- Primary: ${brandColors.primary || 'N/A'}
- Secondary: ${brandColors.secondary || 'N/A'}
- Accent: ${brandColors.accent || 'N/A'}
- Background: ${brandColors.background || 'N/A'}
- Text: ${brandColors.textPrimary || 'N/A'}
- Link: ${brandColors.link || 'N/A'}`;
  }

  prompt += `

## TASK
1. Analyze the Figma design image above
2. Identify all sections (logo, navigation, social icons, legal text)
3. Use the EXACT measurements from Figma for colors, spacing, fonts
4. Assign correct URLs to navigation items from the allLinks array
5. Use the provided logo URL in an <img> tag
6. Use the provided social icon URLs exactly
7. Generate complete, email-safe HTML

Return ONLY the HTML code wrapped in \`\`\`html code blocks.`;

  return prompt;
}
