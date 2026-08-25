// supabase/functions/create-checkout/index.ts
// Deploy: supabase functions deploy create-checkout
//
// v2.683.0 — rewritten. Two defects, both launch-blocking:
//
//  1. Identity came from the request body (`user_id`) while the function held a
//     service-role client, and the Authorization header was never read. Anyone
//     could check out as anyone.
//  2. `mode` was hardcoded to 'subscription' and the `mode` / `product_key` the
//     client sends were discarded. Every one-time product — six of the seven
//     things in the Store — went through Stripe as a subscription.
//
// Identity now comes from the JWT, and the product decides the mode.

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, json, serviceClient, userFromRequest } from '../_shared/http.ts';
import { productFor } from '../_shared/products.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    const user = await userFromRequest(req);
    if (!user) return json(req, { error: 'Unauthorized' }, 401);

    const { price_id, product_key, success_url, cancel_url } = await req.json();

    if (!price_id) return json(req, { error: 'Missing price_id' }, 400);

    // The product decides the mode — the client does not get a vote. A client
    // that could pick the mode could buy a subscription product one-time, or
    // put a one-time product on a recurring charge.
    const product = productFor(product_key);
    if (!product) return json(req, { error: `Unknown product: ${product_key}` }, 400);

    const supabase = serviceClient();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return json(req, { error: 'Profile not found' }, 404);

    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Metadata is how the webhook learns who bought what. It goes on the
    // SESSION for every mode — the old code only put it on subscription_data,
    // so a one-time payment arrived at the webhook with no way to identify the
    // buyer. For subscriptions we set it in both places, because
    // customer.subscription.updated/deleted events carry the subscription's
    // metadata but not the session's.
    const metadata = { supabase_user_id: user.id, product_key: product.key };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: product.mode,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url,
      cancel_url,
      metadata,
      ...(product.mode === 'subscription'
        ? { subscription_data: { metadata }, allow_promotion_codes: true }
        : {}),
    });

    return json(req, { url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return json(req, { error: (err as Error).message }, 500);
  }
});
