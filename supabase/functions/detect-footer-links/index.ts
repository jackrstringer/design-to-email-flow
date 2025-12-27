import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DetectedLink {
  id: string;
  text: string;
  category: 'navigation' | 'button' | 'social' | 'email_action';
  searchedUrl: string;
  verified: boolean;
  needsManualUrl: boolean;
  placeholder?: string;
}

interface ClickableElement {
  id: string;
  text: string;
  category: 'navigation' | 'button' | 'social' | 'email_action';
  likely_destination: string;
}

const SOCIAL_PLATFORMS: Record<string, string> = {
  'instagram': 'instagram.com',
  'facebook': 'facebook.com',
  'twitter': 'twitter.com',
  'x': 'x.com',
  'tiktok': 'tiktok.com',
  'pinterest': 'pinterest.com',
  'youtube': 'youtube.com',
  'linkedin': 'linkedin.com',
  'threads': 'threads.net',
  'snapchat': 'snapchat.com',
};

// Small delay helper for rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Clean URL by removing tracking params
function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove common tracking params
    const trackingParams = ['srsltid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref', 'ref_'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url;
  }
}

// Check if URL is a low-quality match (homepage with tracking, etc.)
function isGoodUrlMatch(url: string, linkText: string, brandDomain: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    
    // Reject homepage for specific link texts (should have a real path)
    if (path === '/' || path === '') {
      const specificLinks = ['deal', 'sale', 'collection', 'shop', 'wallet', 'bag', 'product', 'fit', 'weekly'];
      const lowerText = linkText.toLowerCase();
      if (specificLinks.some(term => lowerText.includes(term))) {
        console.log(`⚠️ Rejecting homepage URL for specific link "${linkText}"`);
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

// Detect if link text refers to a social platform
function detectSocialPlatform(text: string): { platform: string; domain: string } | null {
  const lowerText = text.toLowerCase();
  for (const [platform, domain] of Object.entries(SOCIAL_PLATFORMS)) {
    if (lowerText.includes(platform)) {
      return { platform, domain };
    }
  }
  return null;
}

// Verify a URL with a HEAD request
async function verifyUrl(url: string): Promise<boolean> {
  if (url.startsWith('{{') || url.startsWith('mailto:')) {
    return true;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)'
      }
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.log(`URL verification failed for ${url}:`, error);
    return false;
  }
}

// Search for a real URL using Firecrawl with site filtering
async function searchForUrl(
  brandName: string, 
  linkText: string, 
  brandDomain: string,
  isSocial: boolean = false,
  socialDomain?: string
): Promise<string | null> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    console.log('FIRECRAWL_API_KEY not configured, skipping web search');
    return null;
  }
  
  // Build a site-filtered query for better results
  let query: string;
  if (isSocial && socialDomain) {
    // For socials, search with site filter to the social platform
    query = `${brandName} site:${socialDomain}`;
  } else {
    // For regular links, search with site filter to brand domain
    query = `"${linkText}" site:${brandDomain}`;
  }
  
  console.log(`🔍 Searching: "${query}"`);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 5,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      console.log(`Firecrawl search failed: ${status}`);
      
      // If rate limited, log it clearly
      if (status === 429) {
        console.log('⚠️ Rate limited by Firecrawl, will use fallback');
      }
      return null;
    }

    const data = await response.json();
    const results = data.data || [];
    
    console.log(`📋 Got ${results.length} results`);
    
    if (isSocial && socialDomain) {
      // For social searches, find the matching social domain URL
      for (const result of results) {
        if (result.url && result.url.includes(socialDomain)) {
          const cleanedUrl = cleanUrl(result.url);
          console.log(`✅ Found social URL: ${cleanedUrl}`);
          return cleanedUrl;
        }
      }
    } else {
      // For brand links, find a good quality URL from the brand domain
      for (const result of results) {
        if (result.url && result.url.includes(brandDomain)) {
          const cleanedUrl = cleanUrl(result.url);
          if (isGoodUrlMatch(cleanedUrl, linkText, brandDomain)) {
            console.log(`✅ Found brand URL: ${cleanedUrl}`);
            return cleanedUrl;
          }
        }
      }
    }
    
    // Fallback: try first result if it's from the right domain
    if (results[0]?.url) {
      const cleanedUrl = cleanUrl(results[0].url);
      const targetDomain = isSocial && socialDomain ? socialDomain : brandDomain;
      if (cleanedUrl.includes(targetDomain) && isGoodUrlMatch(cleanedUrl, linkText, brandDomain)) {
        console.log(`⚠️ Using first result: ${cleanedUrl}`);
        return cleanedUrl;
      }
    }
    
    return null;
  } catch (error) {
    console.log(`Firecrawl search error:`, error);
    return null;
  }
}

// Process a single link with search and verification
async function processLink(
  link: DetectedLink, 
  brandName: string, 
  brandDomain: string
): Promise<DetectedLink> {
  // Skip placeholders and mailto
  if (link.searchedUrl.startsWith('{{') || link.searchedUrl.startsWith('mailto:')) {
    link.verified = true;
    link.needsManualUrl = false;
    console.log(`✓ ${link.text}: Placeholder/mailto preserved`);
    return link;
  }
  
  // Check if this is a social link
  const socialInfo = detectSocialPlatform(link.text);
  const isSocial = link.category === 'social' || socialInfo !== null;
  
  // Step 1: Try web search first
  const searchedUrl = await searchForUrl(
    brandName, 
    link.text, 
    brandDomain,
    isSocial,
    socialInfo?.domain
  );
  
  if (searchedUrl) {
    const isValid = await verifyUrl(searchedUrl);
    if (isValid) {
      console.log(`✅ ${link.text}: Found via search → ${searchedUrl}`);
      link.searchedUrl = searchedUrl;
      link.verified = true;
      link.needsManualUrl = false;
      return link;
    } else {
      console.log(`⚠️ ${link.text}: Search result failed verification: ${searchedUrl}`);
    }
  }
  
  // Step 2: Fall back to Claude's guess, verify it
  if (link.searchedUrl) {
    const cleanedGuess = cleanUrl(link.searchedUrl);
    const isValid = await verifyUrl(cleanedGuess);
    if (isValid && isGoodUrlMatch(cleanedGuess, link.text, brandDomain)) {
      console.log(`✅ ${link.text}: Claude guess verified → ${cleanedGuess}`);
      link.searchedUrl = cleanedGuess;
      link.verified = true;
      link.needsManualUrl = false;
      return link;
    }
  }
  
  // Both search and guess failed
  console.log(`❌ ${link.text}: No valid URL found, flagging for manual entry`);
  link.searchedUrl = '';
  link.verified = false;
  link.needsManualUrl = true;
  return link;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clickableElements, brandDomain, brandName } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!clickableElements || clickableElements.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        links: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Detecting links for elements:', clickableElements);
    console.log('Brand:', brandName, 'Domain:', brandDomain);

    // Build a prompt to search for URLs for each element
    const elementsDescription = clickableElements.map((el: ClickableElement, i: number) => 
      `${i + 1}. "${el.text}" (${el.category}) - likely: ${el.likely_destination}`
    ).join('\n');

    const prompt = `You are helping find real URLs for clickable elements in an email footer for the brand "${brandName}" (domain: ${brandDomain}).

Here are the clickable elements detected in the footer:
${elementsDescription}

For each element, determine the most likely real URL. Use your knowledge to construct likely URLs based on:
1. The brand's domain (${brandDomain})
2. Common URL patterns for e-commerce sites
3. The element's purpose/destination

RULES:
- For navigation links (shop, collections, products): Use https://${brandDomain}/collections/[item-name] or https://${brandDomain}/pages/[page-name]
- For social media: Return the full social URL like https://instagram.com/${brandName.toLowerCase().replace(/\s+/g, '')}
- For email actions (unsubscribe, preferences): Use Klaviyo/ESP placeholders:
  - Unsubscribe: {{ unsubscribe_url }}
  - Manage Preferences: {{ manage_preferences_url }}
  - View in Browser: {{ view_in_browser_url }}
  - Forward: {{ forward_to_a_friend_url }}
- For "Contact Us" or email: mailto:support@${brandDomain} or https://${brandDomain}/pages/contact

Return ONLY valid JSON array:
[
  {
    "id": "element_id",
    "text": "THE WALLETS",
    "category": "navigation",
    "searchedUrl": "https://${brandDomain}/collections/wallets",
    "verified": false,
    "needsManualUrl": false,
    "placeholder": null
  },
  {
    "id": "unsubscribe_link",
    "text": "Unsubscribe",
    "category": "email_action",
    "searchedUrl": "{{ unsubscribe_url }}",
    "verified": true,
    "needsManualUrl": false,
    "placeholder": "{{ unsubscribe_url }}"
  }
]`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.content?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in response:', responseText);
      throw new Error('Failed to extract JSON from AI response');
    }

    let links: DetectedLink[] = JSON.parse(jsonMatch[0]);
    
    console.log('AI generated links:', JSON.stringify(links, null, 2));

    // Process links SEQUENTIALLY to avoid rate limits
    console.log('🔍 Searching for real URLs with Firecrawl (sequential to avoid rate limits)...');
    
    const enhancedLinks: DetectedLink[] = [];
    for (const link of links) {
      const processed = await processLink(link, brandName, brandDomain);
      enhancedLinks.push(processed);
      
      // Add a small delay between searches to avoid rate limiting
      // Only delay if it's not a placeholder (which doesn't hit the API)
      if (!link.searchedUrl.startsWith('{{') && !link.searchedUrl.startsWith('mailto:')) {
        await delay(300); // 300ms delay between API calls
      }
    }

    links = enhancedLinks;
    
    console.log('Final verified links:', JSON.stringify(links, null, 2));

    return new Response(JSON.stringify({ 
      success: true,
      links
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Detect footer links error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
