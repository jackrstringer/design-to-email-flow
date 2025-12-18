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

    // Visual validation loop - TRUE side-by-side comparison
    html = await visualValidationLoop(
      ANTHROPIC_API_KEY,
      html,
      exportedImageUrl,
      designData,
      { brandName, websiteUrl, socialIcons, allLinks, lightLogoUrl, darkLogoUrl },
      userPrompt,  // Pass the FULL design prompt for accurate fixes
      7  // Max iterations
    );

    console.log('Successfully generated HTML from Figma with visual validation');

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

// Render HTML to screenshot using HCTI
async function renderHtmlToImage(html: string): Promise<string> {
  const HCTI_USER_ID = Deno.env.get('HCTI_USER_ID');
  const HCTI_API_KEY = Deno.env.get('HCTI_API_KEY');
  
  if (!HCTI_USER_ID || !HCTI_API_KEY) {
    throw new Error('HCTI credentials not configured');
  }
  
  console.log('Rendering HTML to screenshot via HCTI...');
  
  const response = await fetch('https://hcti.io/v1/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(`${HCTI_USER_ID}:${HCTI_API_KEY}`)}`,
    },
    body: JSON.stringify({
      html: html,
      css: '',
      viewport_width: 600,
      viewport_height: 600, // Reduced from 1200 to minimize viewport artifact
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('HCTI error:', response.status, errorText);
    throw new Error(`HCTI error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('HCTI screenshot URL:', data.url);
  return data.url;
}

// Main visual validation loop with CONVERSATION HISTORY
async function visualValidationLoop(
  apiKey: string,
  initialHtml: string,
  referenceImageUrl: string,
  designData: DesignData | null,
  brandContext: any,
  fullDesignPrompt: string,
  maxIterations: number = 7
): Promise<string> {
  let currentHtml = initialHtml;
  
  // Initialize conversation history with system context
  const conversationHistory: any[] = [];
  
  // Track previous discrepancies to detect oscillation
  let previousDiscrepancies: string[] = [];
  
  for (let i = 0; i < maxIterations; i++) {
    console.log(`\n=== Visual comparison iteration ${i + 1}/${maxIterations} ===`);
    
    try {
      // 1. Render current HTML to image
      const renderedImageUrl = await renderHtmlToImage(currentHtml);
      
      // 2. Ask Claude to compare side-by-side WITH HISTORY
      const result = await compareImagesWithClaude(
        apiKey,
        referenceImageUrl,
        renderedImageUrl,
        currentHtml,
        fullDesignPrompt,
        conversationHistory,  // Pass and mutate conversation history
        i  // iteration number for context
      );
      
      if (result.isMatch) {
        console.log(`✓ Visual match achieved at iteration ${i + 1}!`);
        return currentHtml;
      }
      
      console.log(`Found ${result.discrepancies.length} visual discrepancies:`);
      result.discrepancies.forEach((d, idx) => console.log(`  ${idx + 1}. ${d}`));
      
      // Check for oscillation (same issues repeating)
      const sameIssues = result.discrepancies.filter(d => 
        previousDiscrepancies.some(pd => pd.toLowerCase().includes(d.toLowerCase().slice(0, 30)))
      );
      if (sameIssues.length > 0 && i > 2) {
        console.log(`WARNING: ${sameIssues.length} issues repeating from previous iteration`);
        // Add explicit instruction to history about avoiding oscillation
        conversationHistory.push({
          role: 'user',
          content: `CRITICAL: You are repeating the same issues. These problems keep coming back: ${sameIssues.join('; ')}. Try a DIFFERENT approach to fix them this time.`
        });
      }
      
      previousDiscrepancies = result.discrepancies;
      
      // 3. Update HTML with Claude's fixes
      currentHtml = result.fixedHtml;
      
    } catch (error) {
      console.error(`Error in iteration ${i + 1}:`, error);
      if (i === 0) {
        throw error;
      }
      break;
    }
  }
  
  console.log('Max iterations reached - returning best effort');
  return currentHtml;
}

// Claude compares both images with CONVERSATION HISTORY
async function compareImagesWithClaude(
  apiKey: string,
  referenceUrl: string,
  renderedUrl: string,
  currentHtml: string,
  fullDesignPrompt: string,
  conversationHistory: any[],  // Mutable conversation history
  iteration: number
): Promise<{ isMatch: boolean; discrepancies: string[]; fixedHtml: string }> {

  // Build the user message for this iteration
  const userMessage: any = {
    role: 'user',
    content: [
      { type: 'text', text: `=== VISUAL COMPARISON ITERATION ${iteration + 1} ===\n\nREFERENCE IMAGE (what we want to achieve):` },
      { type: 'image', source: { type: 'url', url: referenceUrl } },
      { type: 'text', text: 'CURRENT HTML RENDER (what we have now):' },
      { type: 'image', source: { type: 'url', url: renderedUrl } },
    ],
  };

  // First iteration: include full context
  if (iteration === 0) {
    userMessage.content.push({
      type: 'text',
      text: `You are comparing two email footer images for PIXEL-PERFECT matching.

## IMPORTANT: VIEWPORT RENDERING ARTIFACT
The HTML render image is captured using a fixed 600px viewport. Empty/white space BELOW 
the actual footer content is a VIEWPORT ARTIFACT, not an HTML problem - do NOT report it as a discrepancy.

## YOUR TASK
1. Compare these images VERY carefully, examining every detail OF THE FOOTER CONTENT
2. Identify ALL visual differences between them (excluding viewport whitespace below)
3. If differences exist, generate CORRECTED HTML that fixes every discrepancy

## CRITICAL COMPARISON POINTS
- Background colors (exact hex match, width of colored areas)
- Navigation layout (grid vs columns, number of items per row)
- Text alignment (centered vs left/right aligned)
- Spacing between elements (vertical and horizontal gaps)
- Divider lines (presence, position, thickness, color, length)
- Typography (font size, weight, line-height, color)
- Social icon spacing, size, and alignment
- Logo size, positioning, and surrounding space
- Overall proportions and vertical rhythm WITHIN the footer
- Border presence, color, and width
- Padding around content sections

## COMPLETE DESIGN SPECIFICATION (use these EXACT values for corrections)
${fullDesignPrompt}

## CURRENT HTML
\`\`\`html
${currentHtml}
\`\`\`

## RESPONSE FORMAT

First, list ALL visual differences you observe (excluding viewport whitespace artifact):
<discrepancies>
1. [Specific issue - be VERY detailed about what's wrong and what it should be]
2. [Another specific issue]
...
</discrepancies>

Is this a visual match (98%+ similarity)?
<match>true OR false</match>

If match is false, provide the COMPLETE corrected HTML:
\`\`\`html
[Full corrected HTML - include the entire document, not just changed parts]
\`\`\``
    });
  } else {
    // Subsequent iterations: reference previous context, focus on remaining issues
    userMessage.content.push({
      type: 'text',
      text: `ITERATION ${iteration + 1}: Review your previous fixes. Compare the images again.

## CURRENT HTML (after your previous fixes)
\`\`\`html
${currentHtml}
\`\`\`

## INSTRUCTIONS
1. Look at both images carefully - what STILL doesn't match?
2. Remember what you already tried - don't repeat failed approaches
3. List remaining discrepancies and provide COMPLETE fixed HTML

## RESPONSE FORMAT

<discrepancies>
1. [Remaining issue - be specific]
...
</discrepancies>

<match>true OR false</match>

If match is false:
\`\`\`html
[Complete corrected HTML]
\`\`\``
    });
  }

  // Add this message to conversation history
  conversationHistory.push(userMessage);

  console.log(`Sending iteration ${iteration + 1} to Claude (history length: ${conversationHistory.length})...`);
  console.log('Reference:', referenceUrl);
  console.log('Rendered:', renderedUrl);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 12000,
      system: `You are an expert email HTML developer performing visual validation. 
You are in a MULTI-ITERATION refinement loop where you can see your previous attempts.
Learn from what worked and what didn't. Don't repeat the same mistakes.
Your goal is to achieve a 98%+ visual match with the reference design.`,
      messages: conversationHistory,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude comparison error:', response.status, errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const responseText = data.content?.[0]?.text || '';

  // Add Claude's response to history
  conversationHistory.push({
    role: 'assistant',
    content: responseText,
  });

  // Parse the response
  const matchResult = responseText.match(/<match>(true|false)<\/match>/i);
  const isMatch = matchResult?.[1]?.toLowerCase() === 'true';
  
  const discrepanciesMatch = responseText.match(/<discrepancies>([\s\S]*?)<\/discrepancies>/i);
  const discrepanciesText = discrepanciesMatch?.[1] || '';
  const discrepancies = discrepanciesText
    .split('\n')
    .filter((line: string) => line.trim().match(/^\d+\./))
    .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line: string) => line.length > 0);
  
  // More robust HTML extraction
  let fixedHtml = currentHtml;
  const htmlPatterns = [
    /```html\n([\s\S]*?)\n```/,
    /```html\s*([\s\S]*?)\s*```/i,
    /```\n(<!DOCTYPE[\s\S]*?)\n```/,
    /```(<!DOCTYPE[\s\S]*?)```/,
  ];

  for (const pattern of htmlPatterns) {
    const match = responseText.match(pattern);
    if (match?.[1]) {
      fixedHtml = match[1].trim();
      console.log('HTML extracted successfully');
      break;
    }
  }

  if (fixedHtml === currentHtml && !isMatch) {
    console.warn('WARNING: Claude reported issues but no HTML was extracted!');
    console.log('Response preview:', responseText.slice(0, 500));
  }

  console.log(`Claude comparison result: match=${isMatch}, discrepancies=${discrepancies.length}, history=${conversationHistory.length} messages`);

  return { isMatch, discrepancies, fixedHtml };
}

async function callClaude(apiKey: string, systemPrompt: string, messages: any[]): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
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
