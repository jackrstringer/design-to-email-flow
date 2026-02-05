// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
  _fullDesignPrompt: string,  // Unused now - keeping for API compat
  conversationHistory: any[],
  iteration: number
): Promise<{ isMatch: boolean; discrepancies: string[]; fixedHtml: string }> {

  // Build simple, image-focused comparison prompt
  const userMessage: any = {
    role: 'user',
    content: [
      { type: 'text', text: `REFERENCE (what we want):` },
      { type: 'image', source: { type: 'url', url: referenceUrl } },
      { type: 'text', text: `YOUR RENDER (what we have):` },
      { type: 'image', source: { type: 'url', url: renderedUrl } },
    ],
  };

  if (iteration === 0) {
    userMessage.content.push({
      type: 'text',
      text: `Compare these two images. List what's different, then fix the HTML.

NOTE: White space BELOW the footer content is just viewport - ignore it.

Current HTML:
\`\`\`html
${currentHtml}
\`\`\`

Response format:
<discrepancies>
1. [What's wrong]
</discrepancies>

<match>true or false</match>

If false, provide fixed HTML:
\`\`\`html
[complete fixed HTML]
\`\`\``
    });
  } else {
    userMessage.content.push({
      type: 'text',
      text: `Iteration ${iteration + 1}. What STILL doesn't match? Fix it.

Current HTML:
\`\`\`html
${currentHtml}
\`\`\`

<discrepancies>
1. [Remaining issues]
</discrepancies>

<match>true or false</match>

\`\`\`html
[fixed HTML if needed]
\`\`\``
    });
  }

  conversationHistory.push(userMessage);

  console.log(`Iteration ${iteration + 1} - comparing images (history: ${conversationHistory.length} msgs)`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000,
      },
      system: `You're comparing email footer images. Look at both images carefully. 
List what's visually different, then provide fixed HTML. 
You can see your previous attempts in this conversation - learn from them.`,
      messages: conversationHistory,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude error:', response.status, errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  // Extended thinking returns multiple content blocks - find the text one
  let responseText = '';
  for (const block of data.content || []) {
    if (block.type === 'text') {
      responseText = block.text;
      break;
    }
  }

  conversationHistory.push({ role: 'assistant', content: responseText });

  // Parse response
  const matchResult = responseText.match(/<match>(true|false)<\/match>/i);
  const isMatch = matchResult?.[1]?.toLowerCase() === 'true';
  
  const discrepanciesMatch = responseText.match(/<discrepancies>([\s\S]*?)<\/discrepancies>/i);
  const discrepanciesText = discrepanciesMatch?.[1] || '';
  const discrepancies = discrepanciesText
    .split('\n')
    .filter((line: string) => line.trim().match(/^\d+\./))
    .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line: string) => line.length > 0);
  
  // Extract HTML
  let fixedHtml = currentHtml;
  const htmlMatch = responseText.match(/```html\n?([\s\S]*?)\n?```/);
  if (htmlMatch?.[1]) {
    fixedHtml = htmlMatch[1].trim();
  }

  console.log(`Result: match=${isMatch}, issues=${discrepancies.length}`);

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
      model: 'claude-opus-4-1-20250805',
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000,
      },
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
  // Extended thinking returns multiple content blocks - find the text one
  let responseText = '';
  for (const block of data.content || []) {
    if (block.type === 'text') {
      responseText = block.text;
      break;
    }
  }

  const htmlMatch = responseText.match(/```html\n([\s\S]*?)\n```/);
  return htmlMatch ? htmlMatch[1] : responseText;
}

function buildSystemPrompt(): string {
  return `You are an expert email HTML developer. Your job is to look at the footer design image and recreate it as email-safe HTML.

LOOK AT THE IMAGE. Match what you SEE.

## EMAIL HTML RULES
- Tables only (role="presentation", cellpadding="0" cellspacing="0" border="0")
- ALL styles inline
- NO divs, NO margin, NO flex
- Images need width/height + style="display: block; border: 0;"
- Web-safe fonts: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif

## STRUCTURE
Outer table width="100%" with white background, inner table width="600" with content background.

Return ONLY complete HTML in \`\`\`html blocks.`;
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
    lightLogoUrl,
    darkLogoUrl,
    socialIcons,
    websiteUrl,
    brandName,
  } = data;

  // Extract only the most critical measurements as HINTS
  const bgColor = designData?.colors?.[0] || '#1a1a1a';
  const mainGap = designData?.spacing?.gaps?.[0] || 24;
  
  let prompt = `Recreate this footer design as email-safe HTML. Match what you see in the image EXACTLY.

## ASSETS TO USE

**Logo** (use as <img>, NOT text):
${lightLogoUrl ? `<img src="${lightLogoUrl}" alt="${brandName || 'Logo'}" height="auto" style="display: block; border: 0; max-width: 180px;" />` : 'No logo provided'}

**Website**: ${websiteUrl || 'https://example.com'}
`;

  if (socialIcons && socialIcons.length > 0) {
    prompt += `
**Social Icons** (use these exact img tags):
${socialIcons.map(icon => `${icon.platform}: <a href="${icon.url}"><img src="${icon.iconUrl}" alt="${icon.platform}" width="24" height="24" style="display: block; border: 0;" /></a>`).join('\n')}
`;
  }

  prompt += `
## KEY MEASUREMENTS (hints only - trust your eyes)
- Content width: 600px
- Background: ${bgColor}
- Main spacing: ~${mainGap}px

Look at the image. Match the layout, colors, spacing, and typography you SEE.
Return complete HTML in \`\`\`html blocks.`;

  return prompt;
}
