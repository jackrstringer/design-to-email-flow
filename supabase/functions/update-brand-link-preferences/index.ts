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

    const { brand_id, preferences } = await req.json();

    if (!brand_id || !preferences) {
      throw new Error('brand_id and preferences are required');
    }

    console.log(`Updating link preferences for brand ${brand_id}`);

    // Get current preferences
    const { data: brand } = await supabase
      .from('brands')
      .select('link_preferences')
      .eq('id', brand_id)
      .single();

    const currentPrefs = brand?.link_preferences || {};

    // Merge preferences
    const updatedPrefs = {
      ...currentPrefs,
      ...preferences,
    };

    // Update brand
    const { error: updateError } = await supabase
      .from('brands')
      .update({ link_preferences: updatedPrefs })
      .eq('id', brand_id);

    if (updateError) throw updateError;

    console.log(`Updated link preferences for brand ${brand_id}`);

    return new Response(JSON.stringify({ preferences: updatedPrefs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating link preferences:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
