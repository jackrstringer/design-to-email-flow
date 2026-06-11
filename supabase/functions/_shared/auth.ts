// Shared authentication for edge functions.
//
// Replaces the old pattern of decoding the JWT payload with atob() — which
// performed NO signature verification and was trivially forgeable. Tokens are
// now verified against the Auth server via supabase.auth.getUser().

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export interface AuthResult {
  /** Verified user id, or null when the caller is the service role. */
  userId: string | null;
  /** True when the caller authenticated with the service-role key (internal call). */
  isService: boolean;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Service-role client for privileged DB access inside functions. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/**
 * Verifies the Authorization header. Accepts either:
 *  - the project service-role key (internal function-to-function calls), or
 *  - a user JWT, verified against the Auth server (signature + expiry).
 * Throws AuthError(401) when missing/invalid.
 */
export async function requireAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing Authorization header');
  }
  const token = authHeader.slice('Bearer '.length).trim();

  // Internal calls may authenticate with either form of the service key:
  // the injected key (sb_secret_… on newer projects) or the legacy JWT
  // (SERVICE_ROLE_JWT secret) used for gateway-verified internal fetches.
  if (
    token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    (Deno.env.get('SERVICE_ROLE_JWT') && token === Deno.env.get('SERVICE_ROLE_JWT'))
  ) {
    return { userId: null, isService: true };
  }

  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError('Invalid or expired token');
  }
  return { userId: data.user.id, isService: false };
}

/**
 * Loads a brand row and enforces ownership. Service callers may pass
 * an explicit userId to act on behalf of (from a trusted queue row) or null
 * to skip the ownership check.
 */
export async function requireBrandAccess(
  supabase: SupabaseClient,
  brandId: string,
  auth: AuthResult,
  columns = 'id, user_id',
): Promise<Record<string, unknown>> {
  const { data: brand, error } = await supabase
    .from('brands')
    .select(columns)
    .eq('id', brandId)
    .maybeSingle();

  if (error || !brand) {
    throw new AuthError('Brand not found', 404);
  }
  const row = brand as Record<string, unknown>;
  if (!auth.isService && row.user_id !== auth.userId) {
    throw new AuthError('Not authorized for this brand', 403);
  }
  return row;
}
