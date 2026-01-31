import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: any;
}

interface AssetManifest {
  [key: string]: string;
}

interface StyleTokens {
  background_color?: string;
  text_color?: string;
  accent_color?: string;
  special_effects?: string[];
}

interface LinkMapping {
  id: string;
  text: string;
  url: string;
}

// Vision data from analyze-footer-reference
interface TextBlock {
  text: string;
  bounds: { xLeft: number; xRight: number; yTop: number; yBottom: number };
  width: number;
  height: number;
  estimatedFontSize: number;
}

interface DetectedLogo {
  name: string;
  bounds: { xLeft: number; xRight: number; yTop: number; yBottom: number };
  width: number;
  height: number;
}

interface DetectedObject {
  type: string;
  bounds: { xLeft: number; xRight: number; yTop: number; yBottom: number };
  width: number;
  height: number;
  score: number;
}

interface HorizontalEdge {
  y: number;
  colorAbove: string;
  colorBelow: string;
}

interface FooterVisionData {
  dimensions: { width: number; height: number };
  textBlocks: TextBlock[];
  logos: DetectedLogo[];
  objects?: DetectedObject[];
  horizontalEdges: HorizontalEdge[];
  colorPalette: { background: string; text: string; accent: string };
}

interface FooterConversationRequest {
  action: 'generate' | 'refine' | 'chat';
  referenceImageUrl: string;
  sideBySideScreenshotUrl?: string;
  currentHtml?: string;
  userMessage?: string;
  conversationHistory?: ConversationMessage[];
  assets?: AssetManifest;
  socialIcons?: Array<{ platform: string; url: string }>;
  styles?: StyleTokens;
  links?: LinkMapping[];
  brandName?: string;
  brandDomain?: string;
  // Vision analysis data for precise refinement
  visionData?: FooterVisionData;
  // NEW: Render analysis data for mathematical comparison
  renderVisionData?: FooterVisionData;
  // NEW: Pre-computed mathematical differences
  mathematicalDiffs?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: FooterConversationRequest = await req.json();
    const { 
      action, 
      referenceImageUrl, 
      sideBySideScreenshotUrl,
      currentHtml,
      userMessage,
      conversationHistory = [],
      assets = {},
      socialIcons = [],
      styles,
      links = [],
      brandName,
      brandDomain,
      visionData,
      renderVisionData,
      mathematicalDiffs = []
    } = request;

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log('Footer conversation:', { 
      action, 
      hasReference: !!referenceImageUrl,
      hasSideBySide: !!sideBySideScreenshotUrl,
      hasCurrentHtml: !!currentHtml,
      hasVisionData: !!visionData,
      hasRenderVisionData: !!renderVisionData,
      hasMathDiffs: mathematicalDiffs.length > 0,
      historyLength: conversationHistory.length,
      assetCount: Object.keys(assets).length
    });

    // Build asset list for prompt
    let assetsList = '';
    if (assets && Object.keys(assets).length > 0) {
      for (const [id, url] of Object.entries(assets)) {
        const label = id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        assetsList += `- ${label}: ${url}\n`;
      }
    }
    if (socialIcons && socialIcons.length > 0) {
      for (const icon of socialIcons) {
        const label = icon.platform.charAt(0).toUpperCase() + icon.platform.slice(1);
        assetsList += `- ${label} Icon: ${icon.url}\n`;
      }
    }

    // Build styles section
    let stylesSection = '';
    if (styles) {
      if (styles.background_color) stylesSection += `- Background: ${styles.background_color}\n`;
      if (styles.text_color) stylesSection += `- Text: ${styles.text_color}\n`;
      if (styles.accent_color) stylesSection += `- Accent: ${styles.accent_color}\n`;
    }

    // Build links section
    let linksSection = '';
    if (links && links.length > 0) {
      linksSection = 'LINK MAPPINGS (use these exact URLs for each element):\n';
      for (const link of links) {
        linksSection += `- "${link.text}" → ${link.url}\n`;
      }
    }

    // Build COMPACT vision data section (minimal, actionable info only)
    let visionSection = '';
    if (visionData) {
      // Only include layout-critical info, not verbose dumps
      const logoInfo = visionData.logos.length > 0 
        ? `Logo: ${visionData.logos[0].width}x${visionData.logos[0].height}px at y=${visionData.logos[0].bounds.yTop}px`
        : 'Logo: Use provided asset URL';
      
      // Only include major text elements (nav items, headings)
      const keyTextBlocks = visionData.textBlocks
        .filter(t => t.estimatedFontSize >= 10)
        .slice(0, 6)
        .map(t => `"${t.text.substring(0, 20)}" at y=${t.bounds.yTop}px, ~${t.estimatedFontSize}px`)
        .join(', ');
      
      // Section boundaries (max 4)
      const sections = visionData.horizontalEdges
        .slice(0, 4)
        .map(e => `y=${e.y}px`)
        .join(', ');
      
      visionSection = `
## REFERENCE LAYOUT (600px normalized)
- Dimensions: ${visionData.dimensions.width}x${visionData.dimensions.height}px
- ${logoInfo}
- Colors: bg=${visionData.colorPalette.background}, text=${visionData.colorPalette.text}
- Key text: ${keyTextBlocks || 'N/A'}
- Section boundaries: ${sections || 'N/A'}
`;
    }

    // System prompt
    const brandContext = brandName ? `You are creating a footer for **${brandName}**${brandDomain ? ` (${brandDomain})` : ''}.` : '';
    
    const systemPrompt = `You are an expert email HTML developer. You create pixel-perfect email footers using table-based layouts for maximum email client compatibility.

${brandContext ? `## BRAND IDENTITY
${brandContext}

⚠️ CRITICAL - BRAND ISOLATION:
- You are working ONLY on "${brandName}"
- The logo URL(s) provided below are the ONLY logos you may use
- Do NOT substitute, invent, or guess logo URLs from other brands you may know
- If you see "eskiin", "Pura Vida", or any other brand name in your training data, IGNORE IT
- Use ONLY the asset URLs explicitly provided below

` : ''}${visionSection}

CRITICAL RULES:
- **FOOTER WIDTH MUST BE EXACTLY 600px** - use width="600" attribute AND style="width: 600px; max-width: 600px;" on inner table
- Table-based layout only (no flexbox, no grid)
- The outer wrapper is 100% width, the inner content table is EXACTLY 600px
- ALL styles must be inline (no <style> tags)
- Use provided asset URLs directly in img tags - DO NOT INVENT OR GUESS URLs
- Match designs EXACTLY - colors, spacing, typography, alignment
- VML fallbacks for Outlook backgrounds if needed
- Mobile responsive where possible using max-width
- EVERY clickable element MUST have the correct href from the link mappings
- **NEVER reduce element sizes between iterations** - if something looks smaller, INCREASE it

## KLAVIYO MERGE TAGS (REQUIRED FOR FINE PRINT)
Every footer MUST include a fine print section with these Klaviyo dynamic tags:
- Unsubscribe: <a href="{% unsubscribe_url %}">Unsubscribe</a>
- Preferences: <a href="{% manage_preferences_url %}">Manage Preferences</a>
- Address: {{ organization.address }}
- Organization: {{ organization.name }}

These are ESP placeholders that get replaced when the email is sent. NEVER use real URLs for unsubscribe/preferences links.

Example fine print row:
\`\`\`html
<tr>
  <td style="padding: 20px; text-align: center; font-size: 11px; color: #888888;">
    {{ organization.name }} | {{ organization.address }}<br><br>
    <a href="{% unsubscribe_url %}" style="color: #888888;">Unsubscribe</a> | 
    <a href="{% manage_preferences_url %}" style="color: #888888;">Manage Preferences</a>
  </td>
</tr>
\`\`\`

MANDATORY STRUCTURE:
\`\`\`html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff;">
  <tr>
    <td align="center">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px; background-color: {BG_COLOR};">
        <!-- All content here -->
        <!-- Fine print row with Klaviyo tags REQUIRED -->
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
\`\`\`

${assetsList ? `AVAILABLE ASSETS FOR ${brandName?.toUpperCase() || 'THIS BRAND'} (USE THESE EXACT URLs - NO SUBSTITUTIONS):
${assetsList}

CRITICAL: The logo URL(s) above are for ${brandName || 'this brand'} ONLY. Copy them EXACTLY into your <img src="..."> tag. Never use a different brand's logo. If you don't see a logo URL listed, leave the logo area empty or use a text placeholder.` : ''}
${stylesSection ? `STYLE TOKENS:\n${stylesSection}` : ''}
${linksSection ? `\n${linksSection}` : ''}

When asked to generate or refine HTML, return ONLY the HTML code wrapped in \`\`\`html code blocks. No explanations unless specifically asked.`;

    let messages: any[] = [];
    let newUserContent: any;

    if (action === 'generate') {
      if (!referenceImageUrl) {
        throw new Error('Reference image URL is required for generation');
      }

      newUserContent = [
        {
          type: 'image',
          source: { type: 'url', url: referenceImageUrl }
        },
        {
          type: 'text',
          text: `Convert this email footer design into pixel-perfect HTML. Match EVERY visual detail exactly - background colors, spacing, typography, icon sizes, element alignment.${visionData ? '\n\nUse the PRECISE MEASUREMENTS from the vision analysis in my system prompt to ensure exact sizing.' : ''} Return only the HTML code.`
        }
      ];

    } else if (action === 'refine') {
      if (!sideBySideScreenshotUrl) {
        throw new Error('Side-by-side screenshot URL is required for refinement');
      }
      if (!currentHtml) {
        throw new Error('Current HTML is required for refinement');
      }

      // Build asset hint for logo URLs if available
      const assetHint = assets && Object.keys(assets).length > 0 
        ? `\n\nAvailable logo URLs (use exactly as provided):\n${Object.entries(assets).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\nFor dark backgrounds, use the "logo" or "brand_logo_light" URL.`
        : '';

      // Check if there's a background color issue (highest priority)
      const hasColorIssue = mathematicalDiffs.some(d => d.includes('Background color') || d.includes('CRITICAL'));
      const colorFirstInstruction = hasColorIssue 
        ? `\n\n⚠️⚠️⚠️ BEFORE ANYTHING ELSE: Fix the background color. The mathematical analysis shows the background is WRONG. Set background-color on EVERY table element to the exact reference value.\n`
        : '';

      // Build mathematical differences section if available
      const mathDiffSection = mathematicalDiffs.length > 0 
        ? `
## 🎯 MATHEMATICAL DISCREPANCIES (from Vision API analysis)
These are PRECISE pixel measurements comparing reference vs current render.
FIX THESE SPECIFIC VALUES - do not guess, use the exact pixel differences:
${colorFirstInstruction}
${mathematicalDiffs.map((d, i) => `${i + 1}. ${d}`).join('\n')}

CRITICAL: The above measurements are from automated Vision analysis. They are MORE RELIABLE than visual estimation.
`
        : '';

      // Surgical refinement instructions - minimal changes only
      const surgicalRules = `
⚠️ SURGICAL REFINEMENT RULES (CRITICAL):
1. Make MINIMAL changes - fix only what's visually different
2. PRESERVE all existing structure - do not rewrite the entire footer
3. PRESERVE all Klaviyo tags exactly: {% unsubscribe_url %}, {% manage_preferences_url %}, {{ organization.address }}, {{ organization.name }}
4. PRESERVE all href URLs exactly as they are
5. Only adjust: padding, font-size, color values, spacing, element widths/heights
6. If RIGHT looks correct, return the SAME HTML unchanged
7. NEVER reduce element sizes - only increase if needed
8. Width MUST remain 600px

## 🎯 DIMENSIONAL ACCURACY (HIGHEST PRIORITY)
When mathematical differences are provided below, these are PRECISE measurements from Vision API analysis.
- If a button is listed as "120px NARROWER" → set button width to the EXACT reference value provided
- If social icons are "10px SMALLER" → set icon dimensions to the EXACT reference size
- NEVER estimate - use the EXACT pixel values from the diffs

Example fixes based on diff messages:
- "Button 1 is 120px NARROWER... INCREASE button width to 500px" → set button td width="500" and style="width: 500px"
- "Social icons are 12px SMALLER... INCREASE icon size to 36px" → set icon img width="36" height="36"
- "Logo is 18px NARROWER... INCREASE logo width to 142px" → set logo img width="142"

${visionData ? `Reference dimensions: ${visionData.dimensions.width}x${visionData.dimensions.height}px, bg=${visionData.colorPalette.background}` : ''}
${renderVisionData ? `Render dimensions: ${renderVisionData.dimensions.width}x${renderVisionData.dimensions.height}px, bg=${renderVisionData.colorPalette.background}` : ''}`;

      newUserContent = [
        {
          type: 'image',
          source: { type: 'url', url: sideBySideScreenshotUrl }
        },
        {
          type: 'text',
          text: `Compare LEFT (reference) vs RIGHT (current render).
${mathDiffSection}
${surgicalRules}

Look for these specific differences:
- Color mismatches (background, text)
- Spacing/padding differences
- Font size differences
- Alignment issues

DO NOT:
- Rewrite the entire structure
- Change logo URLs
- Remove or modify Klaviyo merge tags
- Reduce any sizes

${assetHint}

Current HTML:
\`\`\`html
${currentHtml}
\`\`\`

Return the HTML with MINIMAL surgical fixes, or return it unchanged if it already matches.`
        }
      ];

    } else if (action === 'chat') {
      if (!userMessage) {
        throw new Error('User message is required for chat');
      }

      if (currentHtml) {
        newUserContent = [
          {
            type: 'text',
            text: `Current HTML:\n\`\`\`html\n${currentHtml}\n\`\`\`\n\nUser request: ${userMessage}`
          }
        ];
      } else {
        newUserContent = userMessage;
      }

    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    // Build messages array from conversation history
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    messages.push({
      role: 'user',
      content: newUserContent
    });

    console.log('Calling Claude Opus 4 with', messages.length, 'messages, action:', action);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 8000,
        system: systemPrompt,
        messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const assistantContent = data.content?.[0]?.text || '';
    
    console.log('Claude response length:', assistantContent.length);

    // Extract HTML if wrapped in code blocks
    let html = assistantContent;
    const htmlMatch = html.match(/```html\n?([\s\S]*?)```/);
    if (htmlMatch) {
      html = htmlMatch[1].trim();
    } else {
      const codeMatch = html.match(/```\n?([\s\S]*?)```/);
      if (codeMatch) {
        html = codeMatch[1].trim();
      }
    }

    // Update conversation history with iteration marker
    const iterationNum = conversationHistory.filter(m => m.role === 'user').length + 1;
    const updatedHistory: ConversationMessage[] = [
      ...conversationHistory,
      { 
        role: 'user', 
        content: typeof newUserContent === 'string' 
          ? newUserContent 
          : action === 'generate' 
            ? `[Iteration ${iterationNum}] Initial footer generation from reference image`
            : action === 'refine'
              ? `[Iteration ${iterationNum}] Refinement with vision data: ${visionData ? 'YES' : 'NO'}. HTML length: ${currentHtml?.length} chars.`
              : newUserContent
      },
      { 
        role: 'assistant', 
        content: assistantContent 
      }
    ];

    let message: string;
    if (action === 'generate') {
      message = 'Footer HTML generated with vision-guided measurements.';
    } else if (action === 'refine') {
      message = visionData 
        ? 'Compared with precise vision measurements and applied fixes.' 
        : 'Compared side-by-side and applied fixes.';
    } else {
      const nonCodeText = assistantContent.replace(/```[\s\S]*?```/g, '').trim();
      message = nonCodeText || 'Changes applied.';
    }

    return new Response(JSON.stringify({ 
      success: true,
      html,
      message,
      conversationHistory: updatedHistory
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Footer conversation error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});