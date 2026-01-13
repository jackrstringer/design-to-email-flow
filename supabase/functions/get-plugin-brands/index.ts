import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-plugin-token',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get token from query param or header
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || 
                  req.headers.get('x-plugin-token');

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Plugin token is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token and get user_id
    const { data: tokenData, error: tokenError } = await supabase
      .from('plugin_tokens')
      .select('user_id')
      .eq('token', token)
      .single();

    if (tokenError || !tokenData) {
      console.error('[get-plugin-brands] Invalid token:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid plugin token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = tokenData.user_id;
    console.log('[get-plugin-brands] Fetching brands for user:', userId);

    // Update last_used_at for the token
    await supabase
      .from('plugin_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token);

    // Fetch all brands for this user with correct column names
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('id, name, domain, dark_logo_url, light_logo_url, primary_color')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (brandsError) {
      console.error('[get-plugin-brands] Failed to fetch brands:', brandsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch brands', code: brandsError.code }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map response to include backwards-compatible logo_url
    const mappedBrands = (brands || []).map(brand => ({
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      primary_color: brand.primary_color,
      dark_logo_url: brand.dark_logo_url,
      light_logo_url: brand.light_logo_url,
      logo_url: brand.dark_logo_url || brand.light_logo_url || null
    }));

    console.log('[get-plugin-brands] Found', mappedBrands.length, 'brands');

    return new Response(
      JSON.stringify({
        success: true,
        brands: mappedBrands
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[get-plugin-brands] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
