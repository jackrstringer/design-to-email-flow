import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceData {
  type: 'image' | 'html';
  imageUrl: string;
  htmlContent?: string;
  altText?: string;
  link?: string | null;
}

interface TargetSection {
  type: 'footer' | 'slice' | 'all';
  sliceIndex?: number;
}

const EMAIL_HTML_RULES = `
You are an expert email HTML developer helping refine email templates.

## STRICT HTML EMAIL RULES - NEVER VIOLATE

### FORBIDDEN
- NEVER use <div> - ALWAYS use <table> and <td>
- NEVER use CSS margin - Use padding on <td> or spacer rows
- NEVER use float or display: flex/grid
- NEVER omit width/height on images

### REQUIRED
- ALWAYS use <table role="presentation"> for layout
- ALWAYS set cellpadding="0" cellspacing="0" border="0" on tables
- ALWAYS inline all styles
- ALWAYS include width and height on <img> tags
- ALWAYS add style="display: block; border: 0;" to images
- ALWAYS use 600px total width

### LOGO/SOCIAL ICONS
- Logos MUST be <img> tags with provided URLs, NEVER text
- Social icons: Use the URL pattern provided to generate ANY color icon

### SOCIAL ICON COLOR RULE
When changing background colors, UPDATE social icon URLs to use appropriate contrasting colors:
- Dark background → Use light colored icons (ffffff, f0f0f0, etc.)
- Light background → Use dark colored icons (000000, 333333, etc.)
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      allSlices, 
      footerHtml,
      originalCampaignImageUrl,
      currentPreviewImageUrl,  // NEW: Screenshot of current render for visual comparison
      targetSection, // { type: 'footer' | 'slice' | 'all', sliceIndex?: number }
      conversationHistory,
      userRequest, 
      brandUrl,
      brandContext,
      figmaDesignData,
      isFooterMode,
      lightLogoUrl,
      darkLogoUrl,
      socialIcons
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return new Response(JSON.stringify({ 
        error: 'ANTHROPIC_API_KEY is not configured',
        updatedSlices: []
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const target = (targetSection as TargetSection) || { type: 'all' };
    const hasAnyLogo = lightLogoUrl || darkLogoUrl;
    const hasFigmaData = figmaDesignData && Object.keys(figmaDesignData).length > 0;

    console.log('Refine campaign request:', { 
      sliceCount: allSlices?.length, 
      isFooterMode,
      hasFooter: !!footerHtml,
      targetSection: target,
      hasConversationHistory: conversationHistory?.length > 0,
      conversationTurns: conversationHistory?.length || 0,
      userRequest: userRequest?.substring(0, 100),
      hasLogo: hasAnyLogo,
      hasFigmaData,
      hasCurrentPreviewImage: !!currentPreviewImageUrl
    });

    // Build brand context
    const brandName = brandContext?.name || '';
    const brandColors = brandContext?.colors || {};
    
    const colorPalette = [
      brandColors.primary ? `- Primary: ${brandColors.primary}` : null,
      brandColors.secondary ? `- Secondary: ${brandColors.secondary}` : null,
      brandColors.background ? `- Background: ${brandColors.background}` : null,
      brandColors.textPrimary ? `- Text: ${brandColors.textPrimary}` : null,
    ].filter(Boolean).join('\n');

    // Build Figma design specifications section if available
    let figmaSpecsSection = '';
    if (hasFigmaData) {
      figmaSpecsSection = `
## FIGMA DESIGN SPECIFICATIONS (AUTHORITATIVE - USE EXACT VALUES)

These measurements come directly from Figma and must be used EXACTLY as specified:

`;
      if (figmaDesignData.rootDimensions) {
        figmaSpecsSection += `### Root Dimensions\n- Width: ${figmaDesignData.rootDimensions.width}px\n- Height: ${figmaDesignData.rootDimensions.height}px\n\n`;
      }

      if (figmaDesignData.colors && figmaDesignData.colors.length > 0) {
        figmaSpecsSection += `### Exact Colors (use these hex values)\n${figmaDesignData.colors.map((c: string) => `- ${c}`).join('\n')}\n\n`;
      }
      
      if (figmaDesignData.fonts && figmaDesignData.fonts.length > 0) {
        figmaSpecsSection += `### Typography (exact values)\n`;
        figmaDesignData.fonts.forEach((font: any) => {
          figmaSpecsSection += `- Font: ${font.family}, Size: ${font.size}px, Weight: ${font.weight}, Line Height: ${Math.round(font.lineHeight)}px\n`;
        });
        figmaSpecsSection += '\n';
      }
      
      if (figmaDesignData.borders && figmaDesignData.borders.length > 0) {
        figmaSpecsSection += `### Borders (exact values)\n`;
        figmaDesignData.borders.forEach((border: any) => {
          figmaSpecsSection += `- ${border.width}px solid ${border.color}\n`;
        });
        figmaSpecsSection += '\n';
      }
      
      if (figmaDesignData.spacing) {
        figmaSpecsSection += `### Spacing (exact pixel values)\n`;
        if (figmaDesignData.spacing.paddings?.length > 0) {
          figmaSpecsSection += `- Paddings used: ${figmaDesignData.spacing.paddings.join('px, ')}px\n`;
        }
        if (figmaDesignData.spacing.gaps?.length > 0) {
          figmaSpecsSection += `- Gaps used: ${figmaDesignData.spacing.gaps.join('px, ')}px\n`;
        }
        figmaSpecsSection += '\n';
      }

      if (figmaDesignData.elements && figmaDesignData.elements.length > 0) {
        figmaSpecsSection += `### Element Dimensions\n`;
        figmaDesignData.elements.slice(0, 10).forEach((el: any) => {
          let details = `- ${el.name}: ${el.width}x${el.height}px`;
          if (el.backgroundColor) details += ` bg:${el.backgroundColor}`;
          if (el.borderWidth && el.borderColor) details += ` border:${el.borderWidth}px ${el.borderColor}`;
          if (el.padding) details += ` padding:${el.padding.top}/${el.padding.right}/${el.padding.bottom}/${el.padding.left}`;
          if (el.gap) details += ` gap:${el.gap}px`;
          figmaSpecsSection += `${details}\n`;
        });
        figmaSpecsSection += '\n';
      }

      if (figmaDesignData.texts && figmaDesignData.texts.length > 0) {
        const urls = figmaDesignData.texts.filter((t: any) => t.isUrl).map((t: any) => t.content);
        if (urls.length > 0) {
          figmaSpecsSection += `### URLs detected in design\n${urls.map((u: string) => `- ${u}`).join('\n')}\n\n`;
        }
      }

      figmaSpecsSection += `CRITICAL: When refining, match these exact values for pixel-perfect results.
`;
    }

    // Build system prompt
    const systemPrompt = `${EMAIL_HTML_RULES}
${figmaSpecsSection}
## BRAND COLORS (use EXACT values)
${colorPalette || 'Not provided'}

## RESPONSE FORMAT
Return JSON:
{
  "message": "Brief description of changes",
  "updatedSlices": [{ "index": 0, "htmlContent": "..." }],
  "updatedFooterHtml": "..." // only if footer was modified
}

Return FULL updated HTML for any modified sections.`;

    // Build messages array
    const messages: any[] = [];
    
    // Check if we have existing conversation history to continue
    const existingHistory = Array.isArray(conversationHistory) ? conversationHistory : [];
    const hasExistingConversation = existingHistory.length > 0 && 
      existingHistory.some((msg: any) => msg.role && msg.content);
    
    if (hasExistingConversation) {
      for (const msg of existingHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          if (msg.content === userRequest) continue;
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      console.log(`Continuing conversation with ${messages.length} existing turns`);
    }

    // Build the user message with targeted slice/footer reference images
    const slicesArray = allSlices as SliceData[];
    const contentBlocks: any[] = [];
    
    if (target.type === 'footer' || isFooterMode) {
      // Footer refinement - use visual comparison if screenshot available
      if (currentPreviewImageUrl && originalCampaignImageUrl) {
        // VISUAL COMPARISON MODE: Send both images for pixel-by-pixel comparison
        contentBlocks.push({
          type: 'image',
          source: { type: 'url', url: originalCampaignImageUrl }
        });
        contentBlocks.push({
          type: 'text',
          text: '↑ ORIGINAL DESIGN (this is what we want to match)'
        });
        contentBlocks.push({
          type: 'image',
          source: { type: 'url', url: currentPreviewImageUrl }
        });
        contentBlocks.push({
          type: 'text',
          text: `↑ CURRENT RENDER (this is what we have now)

Compare these two images PIXEL BY PIXEL. Identify EVERY visual difference:
- Background colors (check exact hex values)
- Spacing and padding (check pixel values)
- Typography (font sizes, weights, colors, line heights)
- Icon sizes and positions
- Element alignment
- Border colors and widths
- Any missing or extra elements

If you notice elements that require custom assets (icons, logos, images) that haven't been provided, LIST them clearly.

## USER REQUEST
${userRequest}

## CURRENT FOOTER HTML
\`\`\`html
${footerHtml || 'No footer HTML provided'}
\`\`\`

${hasAnyLogo ? `## AVAILABLE LOGOS
${lightLogoUrl ? `- Light logo (for dark bg): ${lightLogoUrl}` : ''}
${darkLogoUrl ? `- Dark logo (for light bg): ${darkLogoUrl}` : ''}` : ''}

${socialIcons?.platforms?.length > 0 ? `## SOCIAL ICONS - DYNAMIC COLOR SYSTEM
URL Pattern: ${socialIcons.urlPattern}

Available platforms:
${socialIcons.platforms.map((s: any) => `- ${s.platform} (slug: "${s.slug}", links to: ${s.profileUrl})`).join('\n')}

Choose icon colors that contrast with background. Dark bg → light icons. Light bg → dark icons.` : ''}

Fix EVERY discrepancy. Return the corrected HTML that matches the original design exactly.`
        });
      } else {
        // TEXT-ONLY MODE: No screenshot available
        contentBlocks.push({
          type: 'text',
          text: `## USER REQUEST (targeting FOOTER)
${userRequest}

## CURRENT FOOTER HTML
\`\`\`html
${footerHtml || 'No footer HTML provided'}
\`\`\`

${hasAnyLogo ? `## AVAILABLE LOGOS
${lightLogoUrl ? `- Light logo (for dark bg): ${lightLogoUrl}` : ''}
${darkLogoUrl ? `- Dark logo (for light bg): ${darkLogoUrl}` : ''}` : ''}

${socialIcons?.platforms?.length > 0 ? `## SOCIAL ICONS - DYNAMIC COLOR SYSTEM
URL Pattern: ${socialIcons.urlPattern}

Available platforms:
${socialIcons.platforms.map((s: any) => `- ${s.platform} (slug: "${s.slug}", links to: ${s.profileUrl})`).join('\n')}

Examples (replace {slug} and {hexColor}):
- White Instagram: https://cdn.simpleicons.org/instagram/ffffff
- Black Facebook: https://cdn.simpleicons.org/facebook/000000  
- Red YouTube: https://cdn.simpleicons.org/youtube/ff0000
- Any color: Use any 6-character hex code WITHOUT the #

IMPORTANT: Choose icon colors that contrast with background:
- Dark background → Light icons (ffffff, f5f5f5, etc.)
- Light/white background → Dark icons (000000, 1a1a1a, etc.)` : ''}`
        });
      }
    } else if (target.type === 'slice' && typeof target.sliceIndex === 'number') {
      // Single slice refinement - include reference image for that slice
      const targetSlice = slicesArray[target.sliceIndex];
      
      if (targetSlice) {
        // Add reference image for the target slice
        if (targetSlice.imageUrl && targetSlice.imageUrl.startsWith('http')) {
          contentBlocks.push({
            type: 'image',
            source: { type: 'url', url: targetSlice.imageUrl }
          });
          contentBlocks.push({
            type: 'text',
            text: `This is the reference image for slice ${target.sliceIndex}. Match this exactly.`
          });
        }
        
        contentBlocks.push({
          type: 'text',
          text: `## USER REQUEST (targeting Slice ${target.sliceIndex})
${userRequest}

## CURRENT HTML FOR SLICE ${target.sliceIndex}
\`\`\`html
${targetSlice.htmlContent || 'No HTML content yet - this is an image slice'}
\`\`\``
        });
      }
    } else {
      // All slices - include reference images for each HTML slice
      const htmlSlices = slicesArray.filter(s => s.type === 'html');
      
      // Add reference images with their slice indices
      for (let i = 0; i < slicesArray.length; i++) {
        const slice = slicesArray[i];
        if (slice.type === 'html' && slice.imageUrl && slice.imageUrl.startsWith('http')) {
          contentBlocks.push({
            type: 'image',
            source: { type: 'url', url: slice.imageUrl }
          });
          contentBlocks.push({
            type: 'text',
            text: `Reference image for Slice ${i}. Current HTML below.`
          });
        }
      }
      
      // Build text content with all HTML
      let allSlicesText = `## USER REQUEST
${userRequest}

## CURRENT HTML SLICES
`;
      slicesArray.forEach((s, i) => {
        if (s.type === 'html') {
          allSlicesText += `### Slice ${i} (HTML)
\`\`\`html
${s.htmlContent}
\`\`\`

`;
        } else {
          allSlicesText += `### Slice ${i} (Image): ${s.imageUrl}

`;
        }
      });

      if (footerHtml) {
        allSlicesText += `### Footer HTML
\`\`\`html
${footerHtml}
\`\`\``;
      }

      if (hasAnyLogo) {
        allSlicesText += `

## AVAILABLE LOGOS
${lightLogoUrl ? `- Light logo (for dark bg): ${lightLogoUrl}` : ''}
${darkLogoUrl ? `- Dark logo (for light bg): ${darkLogoUrl}` : ''}`;
      }

      if (socialIcons?.platforms?.length > 0) {
        allSlicesText += `

## SOCIAL ICONS - DYNAMIC COLOR SYSTEM
URL Pattern: ${socialIcons.urlPattern}

Available platforms:
${socialIcons.platforms.map((s: any) => `- ${s.platform} (slug: "${s.slug}", links to: ${s.profileUrl})`).join('\n')}

Examples: https://cdn.simpleicons.org/instagram/ffffff (white), https://cdn.simpleicons.org/facebook/000000 (black)
Use any 6-char hex color. Match icon color to background contrast.`;
      }

      contentBlocks.push({ type: 'text', text: allSlicesText });
    }

    messages.push({ role: 'user', content: contentBlocks });

    console.log('Sending to Claude:', {
      totalMessages: messages.length,
      isFooterMode,
      hasExistingConversation,
      targetType: target.type,
      targetSliceIndex: target.sliceIndex,
      contentBlockCount: contentBlocks.length,
      hasFigmaData
    });

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
    const responseText = data.content?.[0]?.text || '';
    console.log('Claude response length:', responseText.length);

    // Parse JSON response
    let result = { message: responseText, updatedSlices: [], updatedFooterHtml: null as string | null };
    
    const jsonMatch = responseText.match(/\{[\s\S]*"message"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
        console.log('Parsed result:', { 
          message: result.message?.substring(0, 100),
          updatedSlicesCount: result.updatedSlices?.length,
          hasFooterUpdate: !!result.updatedFooterHtml
        });
      } catch (parseErr) {
        console.warn('Failed to parse JSON, using raw text');
      }
    }

    // Build updated conversation history to return
    const updatedConversationHistory = [
      ...messages,
      { role: 'assistant', content: responseText }
    ];

    return new Response(JSON.stringify({
      ...result,
      conversationHistory: updatedConversationHistory
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Refine campaign error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to process refinement request',
      updatedSlices: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
