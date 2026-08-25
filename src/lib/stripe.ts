import { loadStripe } from '@stripe/stripe-js';
// functions.invoke() needs the client — it is what attaches the caller's JWT.
import { supabase } from './supabase';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string;

// Singleton — loadStripe memoizes on the publishable key
export const stripePromise = publishableKey
  ? loadStripe(publishableKey)
  : null;

export const STRIPE_PRICES = {
  // Recurring subscription ($5/mo): unlocks level 10+ and 1 campaign slot.
  PRO_MONTHLY: import.meta.env.VITE_STRIPE_PRO_MONTHLY_PRICE_ID as string,
  // One-time purchases (mode: 'payment'). Each maps to a Stripe Price.
  // Left blank until products are created in Stripe (Build 3); the Store
  // shows them as "coming soon" while unset.
  CHARACTER_SLOT: import.meta.env.VITE_STRIPE_CHARACTER_SLOT_PRICE_ID as string,
  CAMPAIGN_SLOT: import.meta.env.VITE_STRIPE_CAMPAIGN_SLOT_PRICE_ID as string,
  ULTIMATE_CAMPAIGN: import.meta.env.VITE_STRIPE_ULTIMATE_CAMPAIGN_PRICE_ID as string,
  // v2.682.0 — named for the gem, not the colour, so ONE name runs the whole
  // length of the purchase: this key, the Stripe env var, the `product_key`
  // sent to checkout, the `skin_id` in dice_skin_unlocks, and the id in
  // src/data/diceSkins.ts are all "crimson" / "emerald" / "sapphire". The old
  // RED/GREEN/BLUE names would have needed a colour→gem translation at the
  // webhook, which is exactly the sort of mapping that silently grants the
  // wrong product. Free to rename: no Stripe prices existed under the old
  // names (the env vars were never set, so these were all undefined).
  DICE_CRIMSON: import.meta.env.VITE_STRIPE_DICE_CRIMSON_PRICE_ID as string,
  DICE_EMERALD: import.meta.env.VITE_STRIPE_DICE_EMERALD_PRICE_ID as string,
  DICE_SAPPHIRE: import.meta.env.VITE_STRIPE_DICE_SAPPHIRE_PRICE_ID as string,
} as const;

/** Is Stripe wired up at all? (publishable key present.) When false the
 *  Store renders in catalog/preview mode — products visible, buy buttons
 *  disabled with a "coming soon" note — so it's reviewable before the
 *  Stripe account exists. */
export const STRIPE_CONFIGURED = !!publishableKey;

/** Is a specific product's price ID configured? Buy buttons stay
 *  disabled until both Stripe is configured AND the price ID is set. */
export function isPriceConfigured(priceId: string | undefined): boolean {
  return STRIPE_CONFIGURED && !!priceId && priceId.length > 0;
}

// =============================================================
// Checkout + billing portal
// =============================================================
// v2.683.0 — these three used raw fetch() with `user_id` in the body and NO
// Authorization header, which is the client half of the edge-function
// takeover: the server trusted a body field because the client never sent a
// token. supabase.functions.invoke() attaches the caller's JWT automatically,
// which is why the functions can now ignore the body's opinion about who you
// are. `user_id` is gone from all three payloads — the JWT is the identity.
//
// Also removed here: an EDGE_FUNCTION_TEMPLATES export holding ~50 lines of
// stale edge-function source as a string. Nothing imported it, it no longer
// matched the deployed functions, and it shipped in the entry chunk.

/** Shared invoke + redirect. Errors from the function body come back on
 *  `data.error` as well as `error`, so check both — a 400 with a useful
 *  message would otherwise surface as a generic failure. */
async function invokeAndRedirect(
  fn: 'create-checkout' | 'create-portal-session',
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  const payload = data as { url?: string; error?: string } | null;

  if (error || payload?.error || !payload?.url) {
    throw new Error(payload?.error ?? error?.message ?? fallbackMessage);
  }
  window.location.href = payload.url;
}

/** Subscription checkout ($5/mo). */
export async function redirectToCheckout(priceId: string): Promise<void> {
  return invokeAndRedirect('create-checkout', {
    price_id: priceId,
    product_key: 'pro_monthly',
    success_url: `${window.location.origin}/settings?upgraded=true`,
    cancel_url: `${window.location.origin}/settings`,
  }, 'Failed to create checkout session');
}

/** One-time purchase: character slots, campaign slots, Ultimate, dice.
 *  `productKey` must match a key in supabase/functions/_shared/products.ts —
 *  that table, not the client, decides the Stripe mode and what gets granted. */
export async function redirectToOneTimeCheckout(
  priceId: string,
  productKey: string,
): Promise<void> {
  return invokeAndRedirect('create-checkout', {
    price_id: priceId,
    product_key: productKey,
    success_url: `${window.location.origin}/store?purchased=${encodeURIComponent(productKey)}`,
    cancel_url: `${window.location.origin}/store`,
  }, 'Failed to create checkout session');
}

/** Stripe-hosted billing portal for the signed-in user. */
export async function redirectToCustomerPortal(): Promise<void> {
  return invokeAndRedirect('create-portal-session', {
    return_url: `${window.location.origin}/settings`,
  }, 'Failed to open billing portal');
}
