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

// Verify a URL with a HEAD request
async function verifyUrl(url: string): Promise<boolean> {
  // Skip verification for template placeholders
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

    // Verify each URL with HEAD requests
    console.log('Verifying URLs...');
    const verificationPromises = links.map(async (link) => {
      if (link.searchedUrl.startsWith('{{') || link.searchedUrl.startsWith('mailto:')) {
        // Placeholders and mailto are always verified
        link.verified = true;
        link.needsManualUrl = false;
      } else {
        const isValid = await verifyUrl(link.searchedUrl);
        link.verified = isValid;
        link.needsManualUrl = !isValid;
        console.log(`URL ${link.searchedUrl}: ${isValid ? 'VALID' : 'NOT FOUND'}`);
      }
      return link;
    });

    links = await Promise.all(verificationPromises);
    
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
