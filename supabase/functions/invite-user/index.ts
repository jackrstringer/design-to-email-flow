// invite-user — admin-only team invites. Sends a Supabase auth invite email
// and records the invite; the invited account starts as 'member'.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, serviceClient, AuthError } from "../_shared/auth.ts";
import { newTrace, sanitizeError } from "../_shared/log.ts";

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const ctx = newTrace('invite-user', req);

  try {
    const auth = await requireAuth(req);
    if (!auth.userId) return jsonResponse(req, { error: 'User token required' }, 401);

    const { email, role = 'member' } = await req.json();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return jsonResponse(req, { error: 'Valid email required' }, 400);
    }
    if (!['admin', 'member'].includes(role)) {
      return jsonResponse(req, { error: 'Invalid role' }, 400);
    }

    const supabase = serviceClient();
    const { data: me } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', auth.userId)
      .maybeSingle();
    if (me?.role !== 'admin') {
      return jsonResponse(req, { error: 'Only admins can invite teammates' }, 403);
    }

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://sendr-sooty.vercel.app';
    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });
    if (inviteError) {
      return jsonResponse(req, { error: inviteError.message }, 400);
    }

    await supabase.from('team_invites').insert({
      inviter_user_id: auth.userId,
      email,
      role,
      accepted_user_id: invited?.user?.id ?? null,
    });
    if (invited?.user?.id) {
      await supabase.from('profiles').upsert({ id: invited.user.id, email, role });
    }

    return jsonResponse(req, { success: true, email });
  } catch (error: unknown) {
    if (error instanceof AuthError) return jsonResponse(req, { error: error.message }, error.status);
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
