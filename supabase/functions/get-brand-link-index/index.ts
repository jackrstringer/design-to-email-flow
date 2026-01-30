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

    const { brand_id, page = 1, limit = 50, filter = 'all', search = '' } = await req.json();

    if (!brand_id) {
      throw new Error('brand_id is required');
    }

    console.log(`Fetching links for brand ${brand_id}, page ${page}, filter ${filter}`);

    // Build query
    let query = supabase
      .from('brand_link_index')
      .select('*', { count: 'exact' })
      .eq('brand_id', brand_id)
      .order('use_count', { ascending: false })
      .order('created_at', { ascending: false });

    // Apply filter
    if (filter === 'products') {
      query = query.eq('link_type', 'product');
    } else if (filter === 'collections') {
      query = query.eq('link_type', 'collection');
    } else if (filter === 'unhealthy') {
      query = query.eq('is_healthy', false);
    }

    // Apply search
    if (search) {
      query = query.or(`title.ilike.%${search}%,url.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: links, error, count } = await query;

    if (error) throw error;

    const totalPages = Math.ceil((count || 0) / limit);

    return new Response(JSON.stringify({
      links: links || [],
      total: count || 0,
      page,
      totalPages,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching brand links:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
