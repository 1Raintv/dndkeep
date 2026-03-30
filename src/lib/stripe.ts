import { loadStripe } from '@stripe/stripe-js';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string;

// Singleton — loadStripe memoizes on the publishable key
export const stripePromise = publishableKey
  ? loadStripe(publishableKey)
  : null;

export const STRIPE_PRICES = {
  PRO_MONTHLY: import.meta.env.VITE_STRIPE_PRO_MONTHLY_PRICE_ID as string,
} as const;

// =============================================================
// Checkout redirect
// Call this to send the user to Stripe Checkout.
// Your Supabase Edge Function (see supabase/functions/create-checkout)
// receives the price ID, creates a Checkout Session, and returns
// the session URL. The client then redirects to that URL.
// =============================================================
const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export async function redirectToCheckout(priceId: string, userId: string): Promise<void> {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_id: priceId,
      user_id: userId,
      success_url: `${window.location.origin}/settings?upgraded=true`,
      cancel_url: `${window.location.origin}/settings`,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to create checkout session');
  }

  const { url } = await response.json() as { url: string };
  window.location.href = url;
}

// =============================================================
// Customer portal redirect (manage billing / cancel)
// =============================================================
export async function redirectToCustomerPortal(userId: string): Promise<void> {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-portal-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      return_url: `${window.location.origin}/settings`,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to open billing portal');
  }

  const { url } = await response.json() as { url: string };
  window.location.href = url;
}

// =============================================================
// Supabase Edge Function stubs
// Create these as /supabase/functions/create-checkout/index.ts
// and /supabase/functions/create-portal-session/index.ts.
// Both verify the Supabase JWT before talking to Stripe.
// =============================================================
export const EDGE_FUNCTION_TEMPLATES = {
  createCheckout: `
// supabase/functions/create-checkout/index.ts
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

Deno.serve(async (req) => {
  const { price_id, user_id, success_url, cancel_url } = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', user_id)
    .single();

  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile?.email, metadata: { supabase_user_id: user_id } });
    customerId = customer.id;
    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user_id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: price_id, quantity: 1 }],
    success_url,
    cancel_url,
    subscription_data: { metadata: { supabase_user_id: user_id } },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
`.trim(),
} as const;
