// v2.419.0 — DM-side Natural 20 / Natural 1 house-rule preferences.
//
// Per user request: "Two options within the settings that showcase
// ways that people can do crits."
//
//   • Natural 20s — pick ONE crit damage rule:
//       - 'double_dice'     (default): roll 2× the damage dice
//                                      (RAW; e.g. 3d8 becomes 6d8)
//       - 'max_plus_roll'   (Perkins / Brutal Critical-style):
//                                      take the maximum possible
//                                      damage from the base dice
//                                      then roll the dice once
//                                      and ADD those to the total
//   • Natural 1s — toggle:
//       - true  (default RAW): a 1 on the d20 attack roll auto-fails,
//                              regardless of modifiers / target AC
//       - false               : a 1 is just a 1, modifiers may still
//                              connect against low AC
//   The Nat-1 rule applies only to ATTACK rolls, not damage dice.
//
// Stored in localStorage as a single JSON blob so the prefs travel
// together. The PendingAttack rule engine reads them at roll time
// via the loader below; tests can stub the loader to return a fixed
// preset.

const STORAGE_KEY = 'dndkeep:houseRules';

export type CritRule = 'double_dice' | 'max_plus_roll';

export interface HouseRules {
  critRule: CritRule;
  nat1AutoFails: boolean;
}

const DEFAULT_RULES: HouseRules = {
  critRule: 'double_dice',
  nat1AutoFails: true,
};

function readFromStorage(): HouseRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RULES };
    const parsed = JSON.parse(raw) as Partial<HouseRules>;
    return {
      critRule: parsed.critRule === 'max_plus_roll' ? 'max_plus_roll' : 'double_dice',
      nat1AutoFails: parsed.nat1AutoFails === false ? false : true,
    };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

/**
 * Synchronous loader for non-React contexts (the rule engine in
 * src/lib/pendingAttack.ts reads this when rolling damage / hit
 * results). Always returns a fully-defaulted object — never throws.
 */
export function getHouseRules(): HouseRules {
  return readFromStorage();
}

import { useEffect, useState } from 'react';

export function useHouseRules(): [HouseRules, (next: HouseRules) => void] {
  const [rules, setRulesState] = useState<HouseRules>(readFromStorage);

  useEffect(() => {
    function onChange() {
      setRulesState(readFromStorage());
    }
    window.addEventListener('storage', onChange);
    window.addEventListener('dndkeep:houseRules:changed', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('dndkeep:houseRules:changed', onChange);
    };
  }, []);

  const setRules = (next: HouseRules) => {
    setRulesState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('dndkeep:houseRules:changed'));
    } catch {
      // Storage unavailable; state still flips for this session.
    }
  };

  return [rules, setRules];
}
