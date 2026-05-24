// v2.517.0 — Entitlements: the single source of truth for what a user
// can do based on their subscription + one-time purchases.
//
// THE MODEL (locked spec):
//
// Account / free tier
//   - Anyone with an account gets 1 character slot.
//   - Free characters are capped at level 9. Level 10+ requires an
//     ACTIVE subscription.
//   - Any tier can JOIN a campaign via join code.
//   - Creating/running a campaign as DM requires an active subscription.
//
// Subscription ($5/mo) — "active" means subscription_status === 'active'
//   - Unlocks leveling characters to 10+.
//   - Grants 1 campaign slot (create/run one campaign).
//   - Extra campaign slots (one-time, subscriber-only) stack on top.
//
// One-time purchases (permanent ownership; some FREEZE when sub lapses)
//   - Character slots: each adds 1 slot, up to 10 total (1 base + 9
//     bought). Owned forever. Characters in them level freely to 9; any
//     character at level 10+ FREEZES without an active sub.
//   - Extra campaign slots: subscriber-only; FREEZE when sub lapses.
//   - Ultimate Campaign: account-wide; campaigns created while owned get
//     a 50-scene cap (vs 10). Persists on the campaign.
//   - Dice dyes (cosmetic): never freeze.
//
// FREEZE PRINCIPLE: "owned forever" != "always usable". Anything that
// requires active-subscriber status (level 10+ characters, extra
// campaigns beyond... well, any campaign you DM) freezes when the sub
// lapses and unfreezes on resub. Cosmetics and level-<=9 characters
// never freeze.

import type { Character } from '../types';

/** Minimal shape of the profile fields entitlements care about. */
export interface EntitlementProfile {
  subscription_status: string;      // 'active' | 'inactive' | 'past_due' | 'canceled' | ...
  subscription_tier?: string | null;
  extra_character_slots: number;    // one-time purchased, on top of the 1 base
  extra_campaign_slots: number;     // subscriber-only add-ons
  ultimate_campaign?: boolean;
}

/** The free level cap. Characters may reach this level without a sub;
 *  going ABOVE it (i.e. to FREE_LEVEL_CAP + 1 = 10) requires a sub. */
export const FREE_LEVEL_CAP = 9;

/** Base character slots every account gets for free. */
export const BASE_CHARACTER_SLOTS = 1;

/** Hard ceiling on total character slots (1 base + up to 9 purchased). */
export const MAX_CHARACTER_SLOTS = 10;

/** Default per-campaign scene cap (free) and the Ultimate cap. */
export const DEFAULT_SCENE_LIMIT = 10;
export const ULTIMATE_SCENE_LIMIT = 50;

/** Is the subscription currently active? The ONLY states that count as
 *  active are 'active' and 'trialing' (Stripe trial). Everything else
 *  ('inactive','past_due','canceled','unpaid', etc.) is NOT active, so
 *  subscriber-gated things freeze. */
export function isSubscriptionActive(profile: Pick<EntitlementProfile, 'subscription_status'> | null | undefined): boolean {
  if (!profile) return false;
  const s = (profile.subscription_status ?? '').toLowerCase();
  return s === 'active' || s === 'trialing';
}

/** Total character slots this account owns (base + purchased), capped. */
export function totalCharacterSlots(profile: Pick<EntitlementProfile, 'extra_character_slots'> | null | undefined): number {
  const extra = Math.max(0, profile?.extra_character_slots ?? 0);
  return Math.min(MAX_CHARACTER_SLOTS, BASE_CHARACTER_SLOTS + extra);
}

/** Can the user create another character given how many they already
 *  have? Slots are owned forever regardless of subscription. */
export function canCreateCharacter(
  profile: Pick<EntitlementProfile, 'extra_character_slots'> | null | undefined,
  currentCharacterCount: number,
): { allowed: boolean; reason: string | null; total: number } {
  const total = totalCharacterSlots(profile);
  if (currentCharacterCount >= total) {
    return {
      allowed: false,
      total,
      reason: total >= MAX_CHARACTER_SLOTS
        ? `You've reached the maximum of ${MAX_CHARACTER_SLOTS} character slots.`
        : `You're using all ${total} of your character slots. Buy another slot to create more.`,
    };
  }
  return { allowed: true, reason: null, total };
}

/** Total concurrent campaign slots the user can OWN as DM right now.
 *  Requires an active subscription (the sub grants 1; extra add-ons
 *  stack). Without an active sub this is 0 — all owned campaigns freeze. */
export function activeCampaignSlots(profile: EntitlementProfile | null | undefined): number {
  if (!isSubscriptionActive(profile ?? undefined)) return 0;
  return 1 + Math.max(0, profile?.extra_campaign_slots ?? 0);
}

/** Can the user create a NEW campaign right now? Requires active sub and
 *  available slots given how many they already own. */
export function canCreateCampaign(
  profile: EntitlementProfile | null | undefined,
  currentOwnedCampaignCount: number,
): { allowed: boolean; reason: string | null } {
  if (!isSubscriptionActive(profile ?? undefined)) {
    return { allowed: false, reason: 'Creating a campaign requires an active subscription.' };
  }
  const slots = activeCampaignSlots(profile);
  if (currentOwnedCampaignCount >= slots) {
    return {
      allowed: false,
      reason: `You're using all ${slots} of your campaign slot${slots === 1 ? '' : 's'}. Add a campaign slot to run more.`,
    };
  }
  return { allowed: true, reason: null };
}

/** Can a character of this CURRENT level be advanced one more level?
 *  The wall is going ABOVE the free cap (to level 10) without a sub. */
export function canLevelUp(
  profile: Pick<EntitlementProfile, 'subscription_status'> | null | undefined,
  currentLevel: number,
): { allowed: boolean; reason: string | null } {
  const nextLevel = currentLevel + 1;
  if (nextLevel > FREE_LEVEL_CAP && !isSubscriptionActive(profile ?? undefined)) {
    return {
      allowed: false,
      reason: `Leveling past ${FREE_LEVEL_CAP} requires an active subscription.`,
    };
  }
  return { allowed: true, reason: null };
}

/** Is THIS character currently frozen (view-only)? A character freezes
 *  when it is level 10+ and the owner has no active subscription. Frozen
 *  characters are fully read-only: no rolls, no edits, no prompts. The
 *  owner can still DELETE a frozen character to free its slot. */
export function isCharacterFrozen(
  profile: Pick<EntitlementProfile, 'subscription_status'> | null | undefined,
  character: Pick<Character, 'level'>,
): boolean {
  if (isSubscriptionActive(profile ?? undefined)) return false;
  return (character.level ?? 1) > FREE_LEVEL_CAP;
}

/** The scene cap to stamp on a NEWLY created campaign, based on whether
 *  the owner currently has the account-wide Ultimate unlock. Per spec,
 *  the cap is fixed at creation time. */
export function sceneLimitForNewCampaign(
  profile: Pick<EntitlementProfile, 'ultimate_campaign'> | null | undefined,
): number {
  return profile?.ultimate_campaign ? ULTIMATE_SCENE_LIMIT : DEFAULT_SCENE_LIMIT;
}

/** Can another scene be added to a campaign given its stored cap? */
export function canAddScene(
  sceneLimit: number | null | undefined,
  currentSceneCount: number,
): { allowed: boolean; reason: string | null } {
  const cap = sceneLimit ?? DEFAULT_SCENE_LIMIT;
  if (currentSceneCount >= cap) {
    return {
      allowed: false,
      reason: cap >= ULTIMATE_SCENE_LIMIT
        ? `This campaign has reached its ${cap}-scene limit.`
        : `This campaign has reached its ${cap}-scene limit. The Ultimate Campaign upgrade raises new campaigns to ${ULTIMATE_SCENE_LIMIT} scenes.`,
    };
  }
  return { allowed: true, reason: null };
}
