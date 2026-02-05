// deploy-trigger
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { brand_id, url, title, link_type } = await req.json();

    if (!brand_id || !url || !title || !link_type) {
      throw new Error('brand_id, url, title, and link_type are required');
    }

    console.log(`Adding link for brand ${brand_id}: ${url}`);

    // Get brand domain to normalize URL
    const { data: brand } = await supabase
      .from('brands')
      .select('domain')
      .eq('id', brand_id)
      .single();

    if (!brand) {
      throw new Error('Brand not found');
    }

    // Normalize URL (prepend domain if relative)
    let normalizedUrl = url;
    if (url.startsWith('/')) {
      normalizedUrl = `https://${brand.domain}${url}`;
    } else if (!url.startsWith('http')) {
      normalizedUrl = `https://${brand.domain}/${url}`;
    }

    // Generate embedding for title
    let embedding = null;
    try {
      const embedResponse = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ texts: [title] }),
      });

      if (embedResponse.ok) {
        const { embeddings } = await embedResponse.json();
        if (embeddings && embeddings[0]) {
          embedding = `[${embeddings[0].join(',')}]`;
        }
      }
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Continue without embedding
    }

    // Insert into brand_link_index
    const { data: link, error: insertError } = await supabase
      .from('brand_link_index')
      .insert({
        brand_id,
        url: normalizedUrl,
        title,
        link_type,
        embedding,
        source: 'user_added',
        user_confirmed: true,
        is_healthy: true,
        last_verified_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error('This URL already exists for this brand');
      }
      throw insertError;
    }

    console.log(`Added link ${link.id}`);

    return new Response(JSON.stringify({ link }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error adding brand link:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
