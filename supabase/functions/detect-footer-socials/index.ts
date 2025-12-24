import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

interface DetectedSocial {
  platform: string;
  url: string;
  verified: boolean;
  iconStyle?: string;
}

interface CustomAsset {
  type: 'social_icon' | 'logo' | 'other';
  platform?: string;
  description: string;
  needsUpload: boolean;
}

interface DetectionResult {
  detectedPlatforms: string[];
  socialLinks: DetectedSocial[];
  customAssets: CustomAsset[];
  hasCustomIcons: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { footerImageUrl, brandName, brandDomain, existingSocialLinks } = await req.json();

    if (!footerImageUrl) {
      return new Response(
        JSON.stringify({ error: 'Footer image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log('Detecting socials from footer image for:', brandName || brandDomain);

    // Step 1: Analyze the footer image for social icons
    const analysisResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'url',
                  url: footerImageUrl,
                },
              },
              {
                type: 'text',
                text: `Analyze this email footer image and identify ALL social media icons visible.

For each social icon found, determine:
1. Which platform it is (instagram, facebook, tiktok, twitter/x, youtube, pinterest, linkedin, snapchat, etc.)
2. Whether it appears to be a standard icon or a custom/branded icon

Standard icons = simple flat icons, solid circles with white logos, or recognizable platform icons
Custom icons = circular images with photos, unique artistic styling, non-standard colors, or branded treatments

Return a JSON object with this EXACT structure:
{
  "platforms": [
    {
      "platform": "instagram",
      "isCustomIcon": true,
      "iconDescription": "Circular icon with photo/image background"
    }
  ],
  "hasAnyCustomIcons": true
}

Be thorough - check the entire footer for any social icons. Common locations: center bottom, left/right aligned, in a row.
Return ONLY the JSON, no other text.`,
              },
            ],
          },
        ],
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error('Analysis API error:', errorText);
      throw new Error('Failed to analyze footer image');
    }

    const analysisData = await analysisResponse.json();
    const analysisText = analysisData.content?.[0]?.text || '{}';
    
    let analysisResult;
    try {
      // Extract JSON from the response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysisResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { platforms: [], hasAnyCustomIcons: false };
    } catch (e) {
      console.error('Failed to parse analysis result:', analysisText);
      analysisResult = { platforms: [], hasAnyCustomIcons: false };
    }

    console.log('Detected platforms:', analysisResult.platforms);

    const detectedPlatforms: string[] = analysisResult.platforms?.map((p: any) => p.platform.toLowerCase()) || [];
    const hasCustomIcons = analysisResult.hasAnyCustomIcons || false;

    // Step 2: Use web search to find brand's actual social URLs
    const socialLinks: DetectedSocial[] = [];
    const customAssets: CustomAsset[] = [];

    if (detectedPlatforms.length > 0 && (brandName || brandDomain)) {
      // Use Claude with web search to find social URLs
      const searchResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: 10,
            },
          ],
          messages: [
            {
              role: 'user',
              content: `Find the official social media profile URLs for the brand "${brandName || brandDomain}".

I need to find URLs for these platforms: ${detectedPlatforms.join(', ')}

For each platform, search using queries like:
- "${brandName || brandDomain} instagram official"
- "site:instagram.com ${brandName || brandDomain}"
- "${brandName || brandDomain} tiktok"

Return a JSON object with this structure:
{
  "socialLinks": [
    {
      "platform": "instagram",
      "url": "https://instagram.com/brandname",
      "verified": true
    }
  ]
}

Only include links you found through search. Set "verified" to true if you're confident this is the official brand account.
Return ONLY the JSON, no other text.`,
            },
          ],
        }),
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        
        // Extract the final text response (after tool uses)
        let searchText = '';
        for (const block of searchData.content || []) {
          if (block.type === 'text') {
            searchText = block.text;
          }
        }

        try {
          const jsonMatch = searchText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const searchResult = JSON.parse(jsonMatch[0]);
            for (const link of searchResult.socialLinks || []) {
              socialLinks.push({
                platform: link.platform.toLowerCase(),
                url: link.url,
                verified: link.verified || false,
              });
            }
          }
        } catch (e) {
          console.error('Failed to parse search result:', searchText);
        }
      }
    }

    // Add any detected platforms that weren't found via search
    for (const platform of detectedPlatforms) {
      if (!socialLinks.find(l => l.platform === platform)) {
        socialLinks.push({
          platform,
          url: '',
          verified: false,
        });
      }
    }

    // Record custom assets that need upload
    for (const platformInfo of analysisResult.platforms || []) {
      if (platformInfo.isCustomIcon) {
        customAssets.push({
          type: 'social_icon',
          platform: platformInfo.platform.toLowerCase(),
          description: platformInfo.iconDescription || 'Custom styled icon',
          needsUpload: true,
        });
      }
    }

    // Fill in URLs from existing links ONLY for detected platforms
    const existingLinks = existingSocialLinks || [];
    for (const existing of existingLinks) {
      const found = socialLinks.find(l => l.platform === existing.platform);
      // Only update if platform was detected AND doesn't have a URL yet
      if (found && !found.url && existing.url) {
        found.url = existing.url;
        found.verified = true; // Trust existing links
      }
      // Don't add platforms that weren't detected in the footer
    }

    const result: DetectionResult = {
      detectedPlatforms,
      socialLinks,
      customAssets,
      hasCustomIcons,
    };

    console.log('Detection result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error detecting footer socials:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
