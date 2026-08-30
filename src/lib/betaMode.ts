// src/lib/betaMode.ts
//
// v2.693.0 — The invite-only beta: Stripe off, shop hidden, a fixed allowance
// for every tester.
//
// Owner's decision (2026-08-30): "For release I'm going to have a few people
// test — want to make all the rails off with no shop and then eventually turn
// it back on later. This way we can leave Stripe off while doing the initial
// release." And on what testers get: "I still want the ability to turn on all
// of what we have currently, just want to change it for a short duration —
// short duration will allow people to create characters two and be able to
// create one campaign."
//
// So this is a temporary allowance, not a giveaway: two characters and one
// campaign each, with the paid features usable so those are worth having.
//
// ── TURNING BILLING BACK ON ──────────────────────────────────────────────
// Set `enabled: false`. That is the whole client side: the shop reappears, and
// every entitlement check goes back to reading the subscription. Then apply a
// migration reverting the server-side limits (see the SQL note below).
//
// ── WHY NOT JUST MARK THE TESTERS AS PRO ─────────────────────────────────
// Because it would be a lie the database keeps. Setting
// `subscription_tier = 'pro'` and `subscription_status = 'active'` on accounts
// with no Stripe subscription behind them writes billing state that looks real:
// those accounts would read as paying customers in every query, and when the
// Stripe webhook does go live it would be reconciling against rows Stripe has
// never heard of. A switch costs one constant and leaves the billing columns
// honest — every tester is still `free`, and still has no subscription,
// because they are and they do.
//
// ── THE SERVER ENFORCES THESE TOO ────────────────────────────────────────
// Two Postgres triggers cap characters and campaigns independently of this
// file (a client-only change would let the UI offer what the database then
// refuses). The beta numbers are duplicated into
// supabase/migrations/20260830000000_v2_693_beta_limits.sql, and
// betaMode.test.ts parses that SQL and fails if the two ever disagree.

export const BETA = {
  /** Master switch. False restores normal billing everywhere. */
  enabled: true,

  /** Characters per tester. Normal free tier is BASE_CHARACTER_SLOTS (1). */
  characterSlots: 2,

  /** Campaigns per tester. Normal free tier is 0 — campaigns need a sub. */
  campaignSlots: 1,
} as const;

/** Is the shop reachable? Hidden for the beta — there is nothing to sell yet. */
export function isStoreEnabled(): boolean {
  return !BETA.enabled;
}

/**
 * Should entitlement checks behave as though this account is subscribed?
 *
 * During the beta everyone is, so that a campaign slot is actually usable —
 * the campaigns page, homebrew and realtime sync are all subscription-gated,
 * and granting one campaign while leaving those locked would be pointless.
 * The level cap (9) is deliberately NOT special-cased: it is high enough to
 * test with and lifting it was not asked for.
 */
export function betaGrantsSubscription(): boolean {
  return BETA.enabled;
}
