// v2.683.0 — Shared CORS + auth helpers for the Stripe functions.
//
// Both were previously copy-pasted per function and both were wrong in the same
// way: `Access-Control-Allow-Origin: '*'` on endpoints that move money, and a
// `user_id` read straight out of the request body with the Authorization header
// never looked at.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Origins allowed to call these functions, from the APP_ORIGIN secret
 *  (comma-separated to cover prod + preview + localhost). With the secret
 *  unset we fall back to echoing nothing, which fails closed in the browser
 *  rather than silently reopening the wildcard. */
const ALLOWED = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED.includes(origin) ? origin : (ALLOWED[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Responses differ per Origin, so caches must not share them.
    'Vary': 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/**
 * Resolve the calling user from the Authorization header — the ONLY acceptable
 * source of identity here.
 *
 * The previous versions of create-checkout and create-portal-session took
 * `user_id` from the request body while holding a service-role client. That
 * meant anyone could pass any UUID and act as that user: mint a Stripe billing
 * portal for a stranger's account, read their invoices (billing address, card
 * last-four), change their payment method or cancel their subscription.
 *
 * Returns null when there is no valid bearer token; callers must 401.
 */
export async function userFromRequest(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  // Anon key + the caller's JWT: getUser() then validates the token rather than
  // trusting us. Never the service-role key here — that would validate nothing.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

/** Service-role client, for the writes a verified request is allowed to cause. */
export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}
