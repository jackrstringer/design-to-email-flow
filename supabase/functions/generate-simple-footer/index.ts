import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssetManifest {
  [key: string]: string; // asset_id -> URL
}

interface StyleTokens {
  background_color?: string;
  text_color?: string;
  accent_color?: string;
  special_effects?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      referenceImageUrl, 
      assets,      // Full asset manifest with resolved URLs
      styles,      // Extracted style tokens
      socialIcons  // Array of { platform, url }
    }: {
      referenceImageUrl: string;
      assets: AssetManifest;
      styles: StyleTokens;
      socialIcons?: Array<{ platform: string; url: string }>;
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!referenceImageUrl) {
      throw new Error('Reference image URL is required');
    }

    console.log('Generate footer with explicit assets:', { 
      hasReferenceImage: !!referenceImageUrl,
      assetCount: Object.keys(assets || {}).length,
      hasStyles: !!styles,
      socialIconCount: socialIcons?.length || 0
    });

    // Build explicit asset list for prompt
    let assetsList = '';
    
    // Add custom assets
    if (assets && Object.keys(assets).length > 0) {
      for (const [id, url] of Object.entries(assets)) {
        const label = id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        assetsList += `- ${label}: ${url}\n`;
      }
    }

    // Add social icons
    if (socialIcons && socialIcons.length > 0) {
      for (const icon of socialIcons) {
        const label = icon.platform.charAt(0).toUpperCase() + icon.platform.slice(1);
        assetsList += `- ${label}: ${icon.url}\n`;
      }
    }

    // Build styles section
    let stylesSection = '';
    if (styles) {
      if (styles.background_color) stylesSection += `- Background: ${styles.background_color}\n`;
      if (styles.text_color) stylesSection += `- Text: ${styles.text_color}\n`;
      if (styles.accent_color) stylesSection += `- Accent: ${styles.accent_color}\n`;
      if (styles.special_effects && styles.special_effects.length > 0) {
        stylesSection += `- Effects: ${styles.special_effects.join(', ')}\n`;
      }
    }

    const prompt = `Convert this email footer design into pixel-perfect HTML.

${assetsList ? `ASSETS (use these exact URLs):
${assetsList}` : ''}
${stylesSection ? `
STYLES:
${stylesSection}` : ''}

REQUIREMENTS:
- Table-based layout for email client compatibility
- 600px max width, centered
- ALL styles must be inline (no <style> tags)
- Match the design EXACTLY - colors, spacing, typography, layout
- Use the provided asset URLs directly in img tags
- Mobile responsive where possible
- VML fallbacks for Outlook backgrounds if needed

Return ONLY the HTML code, no explanation.`;

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
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: referenceImageUrl }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    let html = data.content?.[0]?.text || '';
    
    // Extract HTML if wrapped in code blocks
    const htmlMatch = html.match(/```html\n?([\s\S]*?)```/);
    if (htmlMatch) {
      html = htmlMatch[1].trim();
    } else {
      const codeMatch = html.match(/```\n?([\s\S]*?)```/);
      if (codeMatch) {
        html = codeMatch[1].trim();
      }
    }

    console.log('Generated footer HTML length:', html.length);

    return new Response(JSON.stringify({ 
      success: true,
      html 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Generate footer error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
