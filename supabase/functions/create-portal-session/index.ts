// supabase/functions/create-portal-session/index.ts
// Deploy: supabase functions deploy create-portal-session
//
// v2.683.0 — rewritten. This was the worst of the three: a service-role client
// plus `user_id` read from the request body plus `Access-Control-Allow-Origin:
// '*'`, with the Authorization header never read. Passing any user's UUID
// returned a live Stripe billing portal for THEIR account — cancel their
// subscription, read their invoices with billing address and card last-four,
// change their payment method. Identity now comes from the JWT and the body's
// opinion is ignored entirely.

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, json, serviceClient, userFromRequest } from '../_shared/http.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    const user = await userFromRequest(req);
    if (!user) return json(req, { error: 'Unauthorized' }, 401);

    const { return_url } = await req.json();

    const supabase = serviceClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return json(req, { error: 'No billing account found' }, 404);
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url,
    });

    return json(req, { url: portalSession.url });
  } catch (err) {
    console.error('create-portal-session error:', err);
    return json(req, { error: (err as Error).message }, 500);
  }
});
