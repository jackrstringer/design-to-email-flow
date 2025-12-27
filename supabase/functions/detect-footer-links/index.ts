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
  placeholder?: string;
}

interface ClickableElement {
  id: string;
  text: string;
  category: 'navigation' | 'button' | 'social' | 'email_action';
  likely_destination: string;
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
- For navigation links (shop, collections, products): Use ${brandDomain}/collections/[item-name] or ${brandDomain}/pages/[page-name]
- For social media: Return the full social URL like https://instagram.com/${brandName.toLowerCase().replace(/\s+/g, '')}
- For email actions (unsubscribe, preferences): Use Klaviyo/ESP placeholders:
  - Unsubscribe: {{ unsubscribe_url }}
  - Manage Preferences: {{ manage_preferences_url }}
  - View in Browser: {{ view_in_browser_url }}
  - Forward: {{ forward_to_a_friend_url }}
- For "Contact Us" or email: mailto:support@${brandDomain} or ${brandDomain}/pages/contact

Return ONLY valid JSON array:
[
  {
    "id": "element_id",
    "text": "THE WALLETS",
    "category": "navigation",
    "searchedUrl": "https://${brandDomain}/collections/wallets",
    "verified": false,
    "placeholder": null
  },
  {
    "id": "unsubscribe_link",
    "text": "Unsubscribe",
    "category": "email_action",
    "searchedUrl": "{{ unsubscribe_url }}",
    "verified": true,
    "placeholder": "{{ unsubscribe_url }}"
  }
]

Note: "verified": true means it's a standard ESP placeholder that's definitely correct.
"verified": false means it's a best guess based on the brand/domain.`;

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

    const links: DetectedLink[] = JSON.parse(jsonMatch[0]);
    
    console.log('Detected links:', JSON.stringify(links, null, 2));

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
