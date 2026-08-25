// v2.683.0 — The product catalogue, shared by create-checkout and
// stripe-webhook.
//
// WHY THIS FILE EXISTS. Checkout decides what a purchase costs and the webhook
// decides what it grants. When those two live in separate files they drift, and
// the drift is silent: the old webhook granted `subscription_tier: 'pro'` for
// EVERY completed checkout, so a $2 dice set bought full Pro. One table, read
// by both sides, makes that class of bug structural rather than vigilant.
//
// `key` is the single name used end to end: the product_key the client sends,
// the entry here, the skin_id in dice_skin_unlocks, and the id in
// src/data/diceSkins.ts. See STRIPE_PRICES in src/lib/stripe.ts for the other
// end of the same contract.

/** What buying this product does to the account. */
export type Grant =
  | { kind: 'subscription' }                       // handled by subscription events, not here
  | { kind: 'character_slot'; amount: number }     // += extra_character_slots
  | { kind: 'campaign_slot'; amount: number }      // += extra_campaign_slots
  | { kind: 'ultimate_campaign' }                  // ultimate_campaign = true
  | { kind: 'dice_skin'; skinId: string };         // insert into dice_skin_unlocks

export interface Product {
  key: string;
  /** Stripe checkout mode. 'payment' = one-time, 'subscription' = recurring. */
  mode: 'payment' | 'subscription';
  grant: Grant;
}

export const PRODUCTS: Record<string, Product> = {
  pro_monthly:       { key: 'pro_monthly',       mode: 'subscription', grant: { kind: 'subscription' } },
  character_slot:    { key: 'character_slot',    mode: 'payment',      grant: { kind: 'character_slot', amount: 1 } },
  campaign_slot:     { key: 'campaign_slot',     mode: 'payment',      grant: { kind: 'campaign_slot', amount: 1 } },
  ultimate_campaign: { key: 'ultimate_campaign', mode: 'payment',      grant: { kind: 'ultimate_campaign' } },
  crimson:           { key: 'crimson',           mode: 'payment',      grant: { kind: 'dice_skin', skinId: 'crimson' } },
  emerald:           { key: 'emerald',           mode: 'payment',      grant: { kind: 'dice_skin', skinId: 'emerald' } },
  sapphire:          { key: 'sapphire',          mode: 'payment',      grant: { kind: 'dice_skin', skinId: 'sapphire' } },
};

/** Look up a product, or null if the key is not one we sell. Never throw on
 *  unknown input — both callers turn null into a 400 rather than a 500. */
export function productFor(key: unknown): Product | null {
  if (typeof key !== 'string') return null;
  return PRODUCTS[key] ?? null;
}

/** Hard ceiling on purchased character slots, mirroring MAX_CHARACTER_SLOTS
 *  (10) minus BASE_CHARACTER_SLOTS (1) in src/lib/entitlements.ts. The
 *  database trigger caps usage at 10 regardless; this stops us crediting
 *  slots the account can never spend. */
export const MAX_EXTRA_CHARACTER_SLOTS = 9;
