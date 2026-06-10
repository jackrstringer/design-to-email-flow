// Brand secret access (Klaviyo / ClickUp API keys) via Supabase Vault.
//
// Keys are stored encrypted in vault and never returned to the browser.
// Only the service role can execute get_brand_secret (enforced in SQL).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export type BrandSecretKind = 'klaviyo' | 'clickup';

/**
 * Fetches a decrypted brand secret. `supabase` must be a service-role client.
 * Returns null when the secret is not configured.
 */
export async function getBrandSecret(
  supabase: SupabaseClient,
  brandId: string,
  kind: BrandSecretKind,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_brand_secret', {
    p_brand_id: brandId,
    p_kind: kind,
  });
  if (error) {
    console.error(`get_brand_secret(${kind}) failed: ${error.message}`);
    return null;
  }
  return (data as string | null) || null;
}
