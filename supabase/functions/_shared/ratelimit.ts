// Simple fixed-window rate limiting backed by Postgres.
// Uses the check_rate_limit() SQL function (service-role only).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export class RateLimitError extends Error {
  status = 429;
  constructor(bucket: string) {
    super(`Rate limit exceeded for ${bucket}. Try again shortly.`);
  }
}

/**
 * Throws RateLimitError when the caller exceeded `max` calls within
 * `windowSeconds`. Fails open on infrastructure errors (logged) so a
 * rate-limit outage never blocks legitimate work.
 */
export async function enforceRateLimit(
  supabase: SupabaseClient,
  subjectId: string,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_subject: subjectId,
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`check_rate_limit failed (failing open): ${error.message}`);
    return;
  }
  if (data === false) {
    throw new RateLimitError(bucket);
  }
}
