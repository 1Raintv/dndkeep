// v2.416.0 — Shared "Fast Combat Rolls" preference.
//
// Pre-v2.416 the toggle lived in MonsterActionPanel only, with
// localStorage persistence inline. The user wanted the checkbox in
// the InitiativeStrip (under the round/actor display) so the DM
// can flip it during a PC turn too — which means two components
// need to read & write the same preference.
//
// This hook centralizes the storage + cross-component sync. It
// listens for the `storage` event so a flip in one component
// reaches the other immediately even within the same tab if
// triggered by a different surface (e.g. a future Settings page).

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dndkeep:fastCombatRolls';

function readFromStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useFastCombatRolls(): [boolean, (next: boolean) => void] {
  const [fastRolls, setFastRollsState] = useState<boolean>(readFromStorage);

  // Persist + broadcast within-tab via a custom event. The native
  // `storage` event only fires on OTHER tabs, so we manually
  // dispatch one for same-tab subscribers.
  useEffect(() => {
    function onChange() {
      setFastRollsState(readFromStorage());
    }
    window.addEventListener('storage', onChange);
    window.addEventListener('dndkeep:fastCombatRolls:changed', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('dndkeep:fastCombatRolls:changed', onChange);
    };
  }, []);

  const setFastRolls = (next: boolean) => {
    setFastRollsState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      window.dispatchEvent(new Event('dndkeep:fastCombatRolls:changed'));
    } catch {
      // localStorage may be unavailable (private mode quota); state
      // still flips for this session, just won't persist.
    }
  };

  return [fastRolls, setFastRolls];
}
