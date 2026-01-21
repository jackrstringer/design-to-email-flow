import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: any; // Can be string or array with image blocks
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

interface FooterConversationRequest {
  action: 'generate' | 'refine' | 'chat';
  referenceImageUrl: string;
  sideBySideScreenshotUrl?: string; // For refine: single screenshot showing reference + preview
  currentHtml?: string;
  userMessage?: string;
  conversationHistory?: ConversationMessage[];
  assets?: AssetManifest;
  socialIcons?: Array<{ platform: string; url: string }>;
  styles?: StyleTokens;
  links?: LinkMapping[]; // User-approved links for all clickable elements
  // Brand context for isolation
  brandName?: string;
  brandDomain?: string;
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
      brandDomain
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

    // System prompt - consistent across all actions
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

` : ''}CRITICAL RULES:
- **FOOTER WIDTH MUST BE EXACTLY 600px** - use width="600" attribute AND style="width: 600px; max-width: 600px;" on inner table
- Table-based layout only (no flexbox, no grid)
- The outer wrapper is 100% width, the inner content table is EXACTLY 600px
- ALL styles must be inline (no <style> tags)
- Use provided asset URLs directly in img tags - DO NOT INVENT OR GUESS URLs
- Match designs EXACTLY - colors, spacing, typography, alignment
- VML fallbacks for Outlook backgrounds if needed
- Mobile responsive where possible using max-width
- EVERY clickable element MUST have the correct href from the link mappings

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
      // Initial generation - send reference image and ask for HTML
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
          text: 'Convert this email footer design into pixel-perfect HTML. Match EVERY visual detail exactly - background colors, spacing, typography, icon sizes, element alignment. Return only the HTML code.'
        }
      ];

    } else if (action === 'refine') {
      // Refinement - send side-by-side screenshot for comparison
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

      newUserContent = [
        {
          type: 'image',
          source: { type: 'url', url: sideBySideScreenshotUrl }
        },
        {
          type: 'text',
          text: `Side-by-side comparison screenshot.

LEFT = Reference design (target)
RIGHT = Current HTML render

Make RIGHT look identical to LEFT.

Check carefully:
- Fonts (serif vs sans-serif) - use Georgia for serif, system-ui for sans-serif
- Spacing (padding, margins, line-height)
- Separator characters between nav items (• or |)
- Element sizes and positioning
- Overall height and compactness
- Logo size and placement${assetHint}

Current HTML:
\`\`\`html
${currentHtml}
\`\`\`

Return ONLY the corrected HTML.`
        }
      ];

    } else if (action === 'chat') {
      // User chat message - continue conversation
      if (!userMessage) {
        throw new Error('User message is required for chat');
      }

      // If we have current HTML, include it for context
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

    // Add new user message
    messages.push({
      role: 'user',
      content: newUserContent
    });

    console.log('Calling Claude with', messages.length, 'messages, action:', action);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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

    // Update conversation history for next call
    // Store a simplified version (text only) to keep context manageable
    const updatedHistory: ConversationMessage[] = [
      ...conversationHistory,
      { 
        role: 'user', 
        content: typeof newUserContent === 'string' 
          ? newUserContent 
          : action === 'generate' 
            ? '[Sent reference image for initial generation]'
            : action === 'refine'
              ? '[Sent side-by-side comparison screenshot for refinement]'
              : newUserContent
      },
      { 
        role: 'assistant', 
        content: assistantContent 
      }
    ];

    // Determine response message based on action
    let message: string;
    if (action === 'generate') {
      message = 'Footer HTML generated. Auto-refinement will run next.';
    } else if (action === 'refine') {
      message = 'Compared side-by-side and applied fixes.';
    } else {
      // For chat, extract any non-code text as the message
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
