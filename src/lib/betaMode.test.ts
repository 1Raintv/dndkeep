// src/lib/betaMode.test.ts
//
// v2.693.0 — The beta allowance is written down twice, in TypeScript and in
// SQL, because the client and the database enforce it independently. Two copies
// of a number is a bug waiting to happen: if they drift, the UI offers a second
// character and the insert is refused, which reads to a tester as "the app is
// broken" rather than "you hit a limit".
//
// So this test reads the migration and compares. It is the same guard the
// v2.683 entitlement migration asked for in a comment ("Keep these two numbers
// in step with src/lib/entitlements.ts") and never got.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BETA, isStoreEnabled, betaGrantsSubscription } from './betaMode';
import {
  isSubscriptionActive,
  totalCharacterSlots,
  activeCampaignSlots,
  canCreateCharacter,
  canCreateCampaign,
} from './entitlements';

const MIGRATION = 'supabase/migrations/20260830000000_v2_693_beta_limits.sql';

describe('beta mode', () => {
  describe('the client and the database agree', () => {
    const sql = readFileSync(MIGRATION, 'utf8');

    it('character allowance matches the SQL trigger', () => {
      const m = sql.match(/v_total\s*:=\s*(\d+)\s*;/);
      expect(m, 'could not find the character limit in the migration').toBeTruthy();
      expect(Number(m![1])).toBe(BETA.characterSlots);
    });

    it('campaign allowance matches the SQL trigger', () => {
      const m = sql.match(/v_limit\s+integer\s*:=\s*(\d+)/);
      expect(m, 'could not find the campaign limit in the migration').toBeTruthy();
      expect(Number(m![1])).toBe(BETA.campaignSlots);
    });
  });

  describe('while the beta is on', () => {
    // These assume BETA.enabled — guarded so the file still reads sensibly
    // after the switch is flipped rather than failing with a confusing diff.
    if (!BETA.enabled) return;

    it('hides the shop', () => {
      expect(isStoreEnabled()).toBe(false);
    });

    it('grants two characters, whatever the profile says', () => {
      expect(totalCharacterSlots(null)).toBe(2);
      expect(totalCharacterSlots({ extra_character_slots: 0 })).toBe(2);
      expect(canCreateCharacter(null, 1).allowed).toBe(true);
      expect(canCreateCharacter(null, 2).allowed).toBe(false);
    });

    it('grants one campaign, whatever the profile says', () => {
      const free = { subscription_status: 'inactive', subscription_tier: 'free' } as never;
      expect(activeCampaignSlots(free)).toBe(1);
      expect(canCreateCampaign(free, 0).allowed).toBe(true);
      expect(canCreateCampaign(free, 1).allowed).toBe(false);
    });

    it('treats a free account as subscribed, without touching its columns', () => {
      // The point of the switch: features unlock, billing state stays honest.
      const free = { subscription_status: 'inactive' };
      expect(betaGrantsSubscription()).toBe(true);
      expect(isSubscriptionActive(free)).toBe(true);
      expect(free.subscription_status).toBe('inactive');
    });
  });

  it('is a deliberate, temporary state', () => {
    // Tripwire. If this fails you turned the beta off — which is the intended
    // end state, so update this expectation in the same commit as the SQL
    // migration that restores the real limits (both bodies are preserved
    // verbatim in the beta migration's comments).
    expect(BETA.enabled).toBe(true);
  });
});
