// deploy-trigger
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CampaignContext {
  campaign_type: string;
  primary_focus: string;
  detected_products: string[];
  detected_collections: string[];
}

interface MatchSliceInput {
  brand_id: string;
  slice_description: string;
  campaign_context: CampaignContext;
  is_generic_cta: boolean;
}

interface LinkIndexEntry {
  id: string;
  url: string;
  title: string | null;
  link_type: string;
  similarity?: number;
}

interface MatchResult {
  url: string | null;
  source: 'brand_rule' | 'brand_default' | 'index_list_match' | 'vector_high_confidence' | 'vector_claude_confirmed' | 'no_match' | 'no_index' | 'low_confidence';
  confidence: number;
  link_id?: string;
}

interface LinkPreferences {
  default_destination_url?: string;
  product_churn?: 'low' | 'medium' | 'high';
  rules?: Array<{
    id: string;
    name: string;
    destination_url: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input: MatchSliceInput = await req.json();
    const { brand_id, slice_description, campaign_context, is_generic_cta } = input;

    if (!brand_id || !slice_description) {
      return new Response(
        JSON.stringify({ error: 'Missing brand_id or slice_description' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // [DIAGNOSTIC] Log 1: Function entry
    console.log('[match-slice-to-link] Starting', {
      brandId: brand_id,
      isGenericCta: is_generic_cta,
      description: slice_description?.substring(0, 80),
      campaignType: campaign_context?.campaign_type,
      primaryFocus: campaign_context?.primary_focus
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get brand with preferences
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('domain, link_preferences')
      .eq('id', brand_id)
      .single();

    if (brandError || !brand) {
      console.error('Brand not found:', brandError);
      return new Response(
        JSON.stringify({ url: null, source: 'no_index', confidence: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const preferences: LinkPreferences = brand.link_preferences || {};

    // [DIAGNOSTIC] Log 2: Brand preferences
    console.log('[match-slice-to-link] Brand preferences', {
      brandFound: !!brand,
      hasDefaultUrl: !!preferences?.default_destination_url,
      defaultUrl: preferences?.default_destination_url?.substring(0, 60),
      ruleCount: preferences?.rules?.length || 0,
      rules: preferences?.rules?.map(r => r.name) || []
    });

    // 1. Handle generic CTAs first
    if (is_generic_cta) {
      console.log('Handling generic CTA...');
      
      // Check if any product-specific rules match the campaign context
      if (preferences.rules && preferences.rules.length > 0) {
        const contextText = `${campaign_context?.primary_focus || ''} ${(campaign_context?.detected_products || []).join(' ')} ${(campaign_context?.detected_collections || []).join(' ')}`.toLowerCase();
        
        for (const rule of preferences.rules) {
          const ruleName = rule.name.toLowerCase();
          if (contextText.includes(ruleName)) {
            console.log(`Generic CTA matched rule: "${rule.name}" → ${rule.destination_url}`);
            return new Response(
              JSON.stringify({
                url: rule.destination_url,
                source: 'brand_rule',
                confidence: 1.0
              } as MatchResult),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
      
      // No rule matched - use default destination
      if (preferences.default_destination_url) {
        console.log(`Generic CTA using default URL: ${preferences.default_destination_url}`);
        return new Response(
          JSON.stringify({
            url: preferences.default_destination_url,
            source: 'brand_default',
            confidence: 1.0
          } as MatchResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('No default URL set for generic CTA, will try to match from index');
      // Fall through to index matching using campaign primary focus
    }

    // 2. Get the brand's link index
    const { data: linkIndex, error: indexError } = await supabase
      .from('brand_link_index')
      .select('id, url, title, link_type, embedding')
      .eq('brand_id', brand_id)
      .eq('is_healthy', true);

    if (indexError) {
      console.error('Error fetching link index:', indexError);
    }

    const healthyLinks = (linkIndex || []).filter(l => l.url) as LinkIndexEntry[];
    
    // [DIAGNOSTIC] Log 3: Link index
    console.log('[match-slice-to-link] Link index', {
      totalLinks: linkIndex?.length || 0,
      healthyLinks: healthyLinks.length,
      matchingStrategy: healthyLinks.length < 50 ? 'claude_list' : 'vector_search'
    });

    if (healthyLinks.length === 0) {
      // No index - caller should fall back to web search
      return new Response(
        JSON.stringify({ url: null, source: 'no_index', confidence: 0 } as MatchResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Size-based matching strategy
    let matchResult: MatchResult;
    
    if (healthyLinks.length < 50) {
      // SMALL CATALOG: Pass full list to Claude for matching
      console.log('Using small catalog matching (Claude list)');
      matchResult = await matchViaClaudeList(slice_description, healthyLinks);
    } else {
      // LARGE CATALOG: Use vector search + Claude confirmation
      console.log('Using large catalog matching (vector search)');
      matchResult = await matchViaVectorSearch(supabase, brand_id, slice_description);
    }

    // 4. Update usage tracking if we found a match
    if (matchResult.url && matchResult.link_id) {
      console.log(`Updating usage for link ${matchResult.link_id}`);
      await supabase
        .from('brand_link_index')
        .update({
          last_used_at: new Date().toISOString(),
          // use_count incremented via raw sql not supported, skip for now
        })
        .eq('id', matchResult.link_id);
    }

    // [DIAGNOSTIC] Log 4: Final result
    console.log('[match-slice-to-link] Final result', {
      matchedUrl: matchResult.url?.substring(0, 60) || 'none',
      source: matchResult.source,
      confidence: matchResult.confidence.toFixed(2),
      linkId: matchResult.link_id || 'none'
    });
    
    return new Response(
      JSON.stringify(matchResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in match-slice-to-link:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Small catalog matching: Pass full list to Claude Haiku for matching
 */
async function matchViaClaudeList(sliceDescription: string, links: LinkIndexEntry[]): Promise<MatchResult> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not configured');
    return { url: null, source: 'no_match', confidence: 0 };
  }

  const linkList = links.map((l, i) => `${i + 1}. [${l.link_type}] ${l.title || 'Untitled'} → ${l.url}`).join('\n');

  const prompt = `A slice of an email shows: "${sliceDescription}"

Here are all known product/collection links for this brand:
${linkList}

Which link is the CORRECT match for what's shown in the slice?

CRITICAL MATCHING RULES:
1. If the slice shows a SPECIFIC PRODUCT (e.g., "Cruz Snow Jacket"), you MUST find that exact product URL
2. A collection URL (e.g., "/collections/winter-jackets") is NOT a valid match for a specific product
3. Only match collection URLs when the slice promotes a COLLECTION (e.g., "Shop Our Winter Collection")
4. "Related" is NOT the same as "correct" - a jacket product is NOT the winter-jackets collection

5. DATE/VERSION MATCHING IS CRITICAL:
   - "Winter 2025" is NOT the same as "Winter 2024"
   - If the slice says "2025" but the link says "2024", that is NOT a match
   - If the slice mentions a specific year, season, or version, the link MUST match that EXACTLY
   - A link for last year's collection is WRONG for this year's content
   - Example: Slice shows "Shop Winter 2025" but link is "/collections/winter-2024" → NOT a match

6. If the EXACT link isn't available (right product, right year, right version), respond "none"

Response:
- ONLY the number if you find the EXACT correct link (matching product AND any dates/versions/years)
- "none" if the specific product/page isn't in the list (even if a similar but outdated version exists)`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return { url: null, source: 'no_match', confidence: 0 };
    }

    const aiResponse = await response.json();
    const textContent = aiResponse.content?.find((c: { type: string }) => c.type === 'text')?.text || '';
    const match = textContent.trim().toLowerCase();

    console.log(`Claude list match response: "${match}"`);

    if (match === 'none' || match === '') {
      return { url: null, source: 'no_match', confidence: 0 };
    }

    const index = parseInt(match) - 1;
    if (index >= 0 && index < links.length) {
      return {
        url: links[index].url,
        source: 'index_list_match',
        confidence: 0.9,
        link_id: links[index].id
      };
    }

    return { url: null, source: 'no_match', confidence: 0 };
  } catch (error) {
    console.error('Error in Claude list matching:', error);
    return { url: null, source: 'no_match', confidence: 0 };
  }
}

/**
 * Large catalog matching: Vector search + Claude confirmation
 */
// deno-lint-ignore no-explicit-any
async function matchViaVectorSearch(
  supabase: any,
  brandId: string,
  sliceDescription: string
): Promise<MatchResult> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured for embeddings');
    return { url: null, source: 'no_match', confidence: 0 };
  }

  try {
    // 1. Generate embedding for the slice description
    console.log('Generating embedding for slice description...');
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: sliceDescription,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('OpenAI embedding error:', embeddingResponse.status, errorText);
      return { url: null, source: 'no_match', confidence: 0 };
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data?.[0]?.embedding;

    if (!queryEmbedding) {
      console.error('No embedding returned from OpenAI');
      return { url: null, source: 'no_match', confidence: 0 };
    }

    // 2. Vector search for top 5 candidates
    console.log('Performing vector search...');
    const result = await supabase.rpc('match_brand_links', {
      query_embedding: queryEmbedding,
      match_brand_id: brandId,
      match_count: 5
    });
    
    const candidates = result.data as Array<{ id: string; url: string; title: string; link_type: string; similarity: number }> | null;
    const searchError = result.error;

    if (searchError) {
      console.error('Vector search error:', searchError);
      return { url: null, source: 'no_match', confidence: 0 };
    }

    if (!candidates || candidates.length === 0) {
      console.log('No vector search results');
      return { url: null, source: 'no_match', confidence: 0 };
    }

    console.log(`Top candidates: ${candidates.map((c) => `${c.title} (${(c.similarity * 100).toFixed(1)}%)`).join(', ')}`);

    const topMatch = candidates[0];

    // 3. High confidence (>90%) - use directly
    if (topMatch.similarity > 0.90) {
      console.log(`High confidence match: ${topMatch.url}`);
      return {
        url: topMatch.url,
        source: 'vector_high_confidence',
        confidence: topMatch.similarity,
        link_id: topMatch.id
      };
    }

    // 4. Medium confidence (75-90%) - have Claude pick from candidates
    if (topMatch.similarity > 0.75 && ANTHROPIC_API_KEY) {
      console.log('Medium confidence - asking Claude to confirm...');
      
      const candidateList = candidates.map((c, i: number) => 
        `${i + 1}. ${c.title || 'Untitled'} (${Math.round(c.similarity * 100)}% match) → ${c.url}`
      ).join('\n');

      const prompt = `A slice shows: "${sliceDescription}"

Top matching products from the brand's catalog:
${candidateList}

Which is the correct match? Respond with ONLY the number, or "none" if none are correct.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }]
        }),
      });

      if (response.ok) {
        const aiResponse = await response.json();
        const textContent = aiResponse.content?.find((c: { type: string }) => c.type === 'text')?.text || '';
        const pick = textContent.trim().toLowerCase();

        console.log(`Claude confirmation response: "${pick}"`);

        if (pick !== 'none' && pick !== '') {
          const index = parseInt(pick) - 1;
          if (index >= 0 && index < candidates.length) {
            const confirmed = candidates[index];
            return {
              url: confirmed.url,
              source: 'vector_claude_confirmed',
              confidence: confirmed.similarity,
              link_id: confirmed.id
            };
          }
        }
      }
    }

    // 5. Low confidence - no match
    console.log('Low confidence or no Claude confirmation');
    return { 
      url: null, 
      source: 'low_confidence', 
      confidence: topMatch.similarity 
    };

  } catch (error) {
    console.error('Error in vector search matching:', error);
    return { url: null, source: 'no_match', confidence: 0 };
  }
}
