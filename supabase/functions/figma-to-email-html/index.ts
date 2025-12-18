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
  texts: Array<{ content: string; isUrl: boolean; fontSize?: number; fontWeight?: number; color?: string }>;
  spacing: { paddings: number[]; gaps: number[] };
  borders: Array<{ color: string; width: number }>;
  elements: Array<{ 
    name: string; 
    width: number; 
    height: number; 
    type: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    gap?: number;
  }>;
  rootDimensions: { width: number; height: number };
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

    // Build prompts with COMPLETE Figma specifications
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

    console.log('Calling Claude with COMPLETE Figma design tree...');
    console.log('Design data summary:', JSON.stringify({
      colors: designData?.colors?.length || 0,
      fonts: designData?.fonts?.length || 0,
      borders: designData?.borders?.length || 0,
      elements: designData?.elements?.length || 0,
      paddings: designData?.spacing?.paddings || [],
      gaps: designData?.spacing?.gaps || [],
    }, null, 2));

    // Build messages array with images
    const messages: any[] = [
      {
        role: 'user',
        content: [],
      },
    ];

    // Show logos to Claude first
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
      { type: 'text', text: 'FIGMA DESIGN TO REPLICATE EXACTLY:' },
      { type: 'image', source: { type: 'url', url: exportedImageUrl } }
    );

    // Add the detailed prompt
    messages[0].content.push({ type: 'text', text: userPrompt });

    // Initial generation
    let html = await callClaude(ANTHROPIC_API_KEY, systemPrompt, messages);

    if (!html || html.length < 100) {
      throw new Error('Claude did not return valid HTML');
    }

    // Structural validation loop
    const maxIterations = 3;
    for (let i = 0; i < maxIterations; i++) {
      console.log(`Structural validation iteration ${i + 1}/${maxIterations}...`);
      
      const validationResult = validateHtmlStructurally(html, designData);

      if (validationResult.matches) {
        console.log('HTML passes structural validation!');
        break;
      }

      console.log('Structural issues found:', validationResult.discrepancies);

      // Refine with specific corrections
      html = await refineHtml(
        ANTHROPIC_API_KEY,
        html,
        exportedImageUrl,
        validationResult.discrepancies,
        designData
      );
    }

    console.log('Successfully generated HTML from Figma');

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

  const htmlMatch = responseText.match(/```html\n([\s\S]*?)\n```/);
  return htmlMatch ? htmlMatch[1] : responseText;
}

// STRUCTURAL validation - check HTML against Figma specs deterministically
function validateHtmlStructurally(
  html: string,
  designData: DesignData | null
): { matches: boolean; discrepancies: string[] } {
  const discrepancies: string[] = [];
  
  if (!designData) {
    return { matches: true, discrepancies: [] };
  }

  const htmlLower = html.toLowerCase();

  // Check background colors are present
  for (const color of designData.colors) {
    const colorLower = color.toLowerCase();
    // Allow both with and without spaces around colons
    if (!htmlLower.includes(colorLower) && 
        !htmlLower.includes(colorLower.replace('#', ''))) {
      // Only flag if it's a prominent color (in elements)
      const usedInElements = designData.elements.some(
        e => e.backgroundColor?.toLowerCase() === colorLower || 
             e.borderColor?.toLowerCase() === colorLower
      );
      if (usedInElements) {
        discrepancies.push(`Missing color ${color} - should be present in HTML`);
      }
    }
  }

  // Check font sizes are present
  for (const font of designData.fonts) {
    const sizeStr = `${font.size}px`;
    if (!html.includes(`font-size: ${sizeStr}`) && 
        !html.includes(`font-size:${sizeStr}`)) {
      discrepancies.push(`Missing font-size: ${sizeStr} - Figma specifies this exact size`);
    }
  }

  // Check borders are present
  for (const border of designData.borders) {
    const borderWidthStr = `${border.width}px`;
    if (!html.includes(borderWidthStr) || !htmlLower.includes('border')) {
      discrepancies.push(`Missing border: ${border.width}px ${border.color}`);
    }
  }

  // Check padding values
  for (const padding of designData.spacing.paddings) {
    if (padding > 0 && padding <= 100) {
      const paddingStr = `${padding}px`;
      if (!html.includes(`padding: ${paddingStr}`) && 
          !html.includes(`padding:${paddingStr}`) &&
          !html.includes(`padding-top: ${paddingStr}`) &&
          !html.includes(`padding-bottom: ${paddingStr}`) &&
          !html.includes(`padding-left: ${paddingStr}`) &&
          !html.includes(`padding-right: ${paddingStr}`)) {
        // Only flag commonly used padding values
        if (designData.spacing.paddings.filter(p => p === padding).length > 0) {
          discrepancies.push(`Consider using padding: ${paddingStr} from Figma specs`);
        }
      }
    }
  }

  return {
    matches: discrepancies.length === 0,
    discrepancies: discrepancies.slice(0, 5) // Limit to top 5 issues
  };
}

async function refineHtml(
  apiKey: string,
  currentHtml: string,
  referenceImageUrl: string,
  discrepancies: string[],
  designData: DesignData | null
): Promise<string> {
  const prompt = `Fix these SPECIFIC issues in the HTML to match the Figma design EXACTLY:

## ISSUES TO FIX
${discrepancies.map((d, i) => `${i + 1}. ${d}`).join('\n')}

## EXACT VALUES FROM FIGMA (use these precisely)
${designData ? `
### COLORS
${designData.colors.map(c => `- ${c}`).join('\n')}

### FONT SIZES
${designData.fonts.map(f => `- ${f.size}px (weight: ${f.weight}, line-height: ${Math.round(f.lineHeight)}px)`).join('\n')}

### BORDERS
${designData.borders.map(b => `- ${b.width}px solid ${b.color}`).join('\n')}

### PADDING VALUES
${designData.spacing.paddings.map(p => `- ${p}px`).join('\n')}

### GAP VALUES  
${designData.spacing.gaps.map(g => `- ${g}px`).join('\n')}

### ELEMENT DIMENSIONS
${designData.elements.slice(0, 10).map(e => 
  `- ${e.name}: ${e.width}x${e.height}px${e.backgroundColor ? ` bg:${e.backgroundColor}` : ''}${e.borderWidth ? ` border:${e.borderWidth}px ${e.borderColor}` : ''}`
).join('\n')}
` : 'Use values from the reference image'}

## CURRENT HTML TO FIX
\`\`\`html
${currentHtml}
\`\`\`

Apply the EXACT corrections. Return ONLY the corrected HTML wrapped in \`\`\`html code blocks.`;

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

## CRITICAL: USE EXACT FIGMA VALUES

You will be given EXACT measurements from Figma:
- EXACT colors (hex values)
- EXACT font sizes (in pixels)
- EXACT padding values (in pixels)
- EXACT gap/spacing values (in pixels)
- EXACT border widths and colors
- EXACT element dimensions

USE THESE VALUES PRECISELY. Do NOT round, estimate, or substitute.

## EMAIL-SAFE HTML REQUIREMENTS

### REQUIRED
- Tables with role="presentation" for ALL layout
- ALL styles inline (no <style> blocks)
- All tables: cellpadding="0" cellspacing="0" border="0"
- Images: width/height attributes + style="display: block; border: 0;"
- Web-safe fonts: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif

### PROHIBITED
- NO div elements for layout
- NO margin CSS (use padding only)
- NO float or flex
- NO unitless values

### STRUCTURE
\`\`\`html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: [CONTENT_BG];">
        <!-- Content here -->
      </table>
    </td>
  </tr>
</table>
\`\`\`

### LOGOS
Use <img> tags with EXACT URLs provided. Never render brand name as text.
Logo should have height="auto" and max-width constraint.

### SOCIAL ICONS
Use EXACT iconUrl values provided. Size: 24x24px.`;
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

// Format the design tree for Claude to understand structure
function formatDesignTree(node: any, depth: number = 0, maxDepth: number = 4): string {
  if (depth > maxDepth) return '';
  
  const indent = '  '.repeat(depth);
  let output = '';
  
  output += `${indent}${node.name || 'unnamed'} (${node.type})\n`;
  
  if (node.width && node.height) {
    output += `${indent}  Size: ${Math.round(node.width)}x${Math.round(node.height)}px\n`;
  }
  if (node.backgroundColor) {
    output += `${indent}  Background: ${node.backgroundColor}\n`;
  }
  if (node.borderColor && node.borderWidth) {
    output += `${indent}  Border: ${node.borderWidth}px ${node.borderColor}\n`;
  }
  if (node.fontSize) {
    output += `${indent}  Font: ${node.fontSize}px, weight ${node.fontWeight || 400}\n`;
  }
  if (node.padding) {
    output += `${indent}  Padding: ${node.padding.top}/${node.padding.right}/${node.padding.bottom}/${node.padding.left}px\n`;
  }
  if (node.itemSpacing) {
    output += `${indent}  Gap: ${node.itemSpacing}px\n`;
  }
  if (node.text) {
    output += `${indent}  Text: "${node.text.substring(0, 50)}${node.text.length > 50 ? '...' : ''}"\n`;
  }
  if (node.color) {
    output += `${indent}  Color: ${node.color}\n`;
  }
  
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      output += formatDesignTree(child, depth + 1, maxDepth);
    }
  }
  
  return output;
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

## COMPLETE FIGMA DESIGN TREE
\`\`\`
${design ? formatDesignTree(design) : 'Design tree not available'}
\`\`\`

`;

  if (designData) {
    prompt += `## EXACT SPECIFICATIONS FROM FIGMA (MANDATORY - NO GUESSING)

### ROOT DIMENSIONS
- Width: ${designData.rootDimensions.width}px
- Height: ${designData.rootDimensions.height}px

### COLORS (use these EXACT hex values)
${designData.colors.map(c => `- ${c}`).join('\n')}

### TYPOGRAPHY (use these EXACT pixel values)
${designData.fonts.map(f => 
  `- Font-family: ${f.family}
   Font-size: ${f.size}px
   Font-weight: ${f.weight}
   Line-height: ${Math.round(f.lineHeight)}px`
).join('\n\n')}

### BORDERS (use these EXACT values)
${designData.borders.length > 0 
  ? designData.borders.map(b => `- ${b.width}px solid ${b.color}`).join('\n')
  : '- No borders detected'}

### PADDING VALUES (use these EXACT values)
${designData.spacing.paddings.length > 0
  ? designData.spacing.paddings.map(p => `- ${p}px`).join('\n')
  : '- No specific padding values detected'}

### GAP/SPACING VALUES (use these EXACT values)
${designData.spacing.gaps.length > 0
  ? designData.spacing.gaps.map(g => `- ${g}px`).join('\n')
  : '- No specific gap values detected'}

### ELEMENT DETAILS
${designData.elements.slice(0, 15).map(e => {
  let details = `- ${e.name}: ${e.width}x${e.height}px`;
  if (e.backgroundColor) details += `\n    Background: ${e.backgroundColor}`;
  if (e.borderColor && e.borderWidth) details += `\n    Border: ${e.borderWidth}px ${e.borderColor}`;
  if (e.borderRadius) details += `\n    Border-radius: ${e.borderRadius}px`;
  if (e.padding) details += `\n    Padding: ${e.padding.top}/${e.padding.right}/${e.padding.bottom}/${e.padding.left}px`;
  if (e.gap) details += `\n    Gap: ${e.gap}px`;
  return details;
}).join('\n')}

### TEXT CONTENT WITH STYLES
${designData.texts.slice(0, 25).map(t => {
  let details = `- "${t.content}"`;
  if (t.fontSize) details += ` (${t.fontSize}px`;
  if (t.fontWeight) details += `, weight ${t.fontWeight}`;
  if (t.color) details += `, color: ${t.color}`;
  if (t.fontSize || t.fontWeight || t.color) details += ')';
  return details;
}).join('\n')}
`;
  }

  prompt += `
## BRAND CONTEXT
- Brand Name: ${brandName || 'Unknown'}
- Website: ${websiteUrl || 'https://example.com'}

## LOGOS (use these EXACT URLs in <img> tags)
${lightLogoUrl ? `Light logo (for dark backgrounds): <img src="${lightLogoUrl}" alt="${brandName} logo" height="auto" style="display: block; border: 0; max-width: 180px;" />` : 'No light logo'}
${darkLogoUrl ? `Dark logo (for light backgrounds): <img src="${darkLogoUrl}" alt="${brandName} logo" height="auto" style="display: block; border: 0; max-width: 180px;" />` : 'No dark logo'}

CRITICAL: Copy the <img> tag EXACTLY as shown above. Do NOT render brand name as text.
`;

  if (socialIcons && socialIcons.length > 0) {
    prompt += `
## SOCIAL ICONS (use these EXACT URLs and dimensions)
${socialIcons.map(icon => `- ${icon.platform}:
    Link: ${icon.url}
    Icon: <img src="${icon.iconUrl}" alt="${icon.platform}" width="24" height="24" style="display: block; border: 0;" />`).join('\n')}
`;
  }

  if (allLinks && allLinks.length > 0) {
    prompt += `
## AVAILABLE LINKS (match navigation text to these URLs)
${allLinks.slice(0, 20).map(link => `- ${link}`).join('\n')}
`;
  }

  prompt += `
## CRITICAL REQUIREMENTS

1. USE EXACT VALUES - Every color, font-size, padding, and gap must match Figma PRECISELY
2. Do NOT round 14px to 16px or 24px to 20px - use the EXACT pixel values
3. Match the visual structure EXACTLY as shown in the reference image
4. Use the provided logo <img> tags - do NOT render brand name as text
5. Maintain ALL spacing between elements as specified

Return ONLY the complete HTML wrapped in \`\`\`html code blocks.`;

  return prompt;
}
