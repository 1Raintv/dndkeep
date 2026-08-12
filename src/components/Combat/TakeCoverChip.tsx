// v2.652.0 — "You can take cover here" chip.
//
// The player-facing half of the cover ship. It appears next to the Your
// Turn banner ONLY when the player's token is standing next to a
// creature big enough to duck behind — the rest of the time it renders
// nothing, so a party crossing an open field never sees it. Clicking it
// opens a breakdown of what is available and what it is currently
// buying them.
//
// Why it does not have a "commit" button: cover in 2024 D&D is
// directional and evaluated per attack, not a stance you enter. The
// attacker's line of effect is what decides it, and DeclareAttackModal
// already derives that live at declare time through the same
// src/rules/cover functions this chip reads. A pinned "I am in cover"
// flag would go stale the moment the archer walked around the pillar,
// and would then feed a wrong number into a real attack roll. So this
// surface informs; it never writes.

import { useEffect, useState } from 'react';
import { useCombat } from '../../context/CombatContext';
import {
  loadActiveBattleMap,
  findNearbyCoverBlockers,
  summariseCoverAgainstThreats,
  tokenToCoverBlocker,
  tokenFootprintRange,
  coverLabel,
  type ActiveBattleMap,
  type BattleMapToken,
  type CoverLevel,
} from '../../lib/battleMapGeometry';

interface CoverPicture {
  /** Creatures adjacent enough to be worth ducking behind. */
  nearby: string[];
  /** Best cover currently held against any threat on the map. */
  level: CoverLevel;
  /** Threat names this cover applies against. */
  coveredFrom: string[];
  /** Threats on the map that can see you cleanly anyway. */
  exposedTo: string[];
}

const COVER_COLOR: Record<CoverLevel, string> = {
  none: '#94a3b8',
  half: '#60a5fa',
  three_quarters: '#a78bfa',
  total: '#f87171',
};

/**
 * Party-side test, matching battlemap/coverState.isPartyToken and the
 * friendly-fire heuristic in DeclareAttackModal (v2.105): a token
 * linked to a player character is a party member, everything else is
 * treated as opposition. DNDKeep has no faction model yet.
 */
function isParty(t: BattleMapToken): boolean {
  return !!t.character_id;
}

function buildPicture(map: ActiveBattleMap, myToken: BattleMapToken): CoverPicture | null {
  const others = map.tokens.filter(t => t !== myToken);
  const blockers = others.map(tokenToCoverBlocker);
  const nearbyBlockers = findNearbyCoverBlockers(
    tokenFootprintRange(myToken),
    myToken.size_label,
    blockers,
  );
  if (nearbyBlockers.length === 0) return null;   // nothing to hide behind

  // v2.652.0 — shares `summariseCoverAgainstThreats` with the map's
  // token badge (battlemap/coverState.ts). This used to be its own loop
  // and drifted immediately: the map learned to ignore threats sealed
  // off behind total cover, the chip did not, and the first live run
  // listed a Crypt Skeleton three rooms away under "Covered from".
  const summary = summariseCoverAgainstThreats(
    { row: myToken.row, col: myToken.col },
    myToken.size_label,
    others.filter(t => !isParty(t)).map(t => ({
      id: (t.id as string) ?? (t.name ?? ''),
      name: t.name,
      cell: { row: t.row, col: t.col },
    })),
    map.walls,
    blockers,
    map.grid_size,
  );

  return {
    nearby: nearbyBlockers.map(b => b.name).filter((n): n is string => !!n),
    level: summary.level,
    coveredFrom: summary.coveredFrom,
    exposedTo: summary.exposedTo,
  };
}

export function TakeCoverChip({ campaignId, characterId }: {
  campaignId: string | null | undefined;
  characterId: string;
}) {
  const { encounter, currentActor } = useCombat();
  const [picture, setPicture] = useState<CoverPicture | null>(null);
  const [open, setOpen] = useState(false);

  const isMyTurn = encounter?.status === 'active'
    && currentActor?.entity_id === characterId
    && currentActor?.participant_type === 'character';

  // Load the map once per turn hand-off. Gated on it actually being the
  // player's turn so a table of six sheets isn't polling the scene.
  useEffect(() => {
    if (!isMyTurn || !campaignId) { setPicture(null); setOpen(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const map = await loadActiveBattleMap(campaignId);
        if (cancelled || !map) return;
        const myToken = map.tokens.find(t => t.character_id === characterId);
        if (!myToken) return;   // not placed on this scene
        setPicture(buildPicture(map, myToken));
      } catch {
        /* map is optional — theater-of-the-mind campaigns have none */
      }
    })();
    return () => { cancelled = true; };
  }, [isMyTurn, campaignId, characterId, encounter?.round_number]);

  if (!isMyTurn || !picture) return null;

  const color = COVER_COLOR[picture.level];
  const hasCover = picture.level !== 'none';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={hasCover
          ? `${coverLabel(picture.level)} — click for details`
          : 'Cover available nearby — click for details'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 9px', borderRadius: 999,
          fontSize: 11, fontWeight: 800, letterSpacing: '0.02em',
          cursor: 'pointer',
          color,
          background: hasCover ? `${color}22` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${hasCover ? `${color}66` : 'var(--c-border)'}`,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>⛨</span>
        {hasCover ? coverLabel(picture.level) : 'Cover nearby'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40,
          minWidth: 230, padding: '10px 12px', borderRadius: 8,
          background: 'var(--c-panel, #14161a)',
          border: '1px solid var(--c-border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          fontSize: 11, lineHeight: 1.5, color: 'var(--t-2)',
          textAlign: 'left', fontWeight: 500,
        }}>
          <div style={{ fontWeight: 800, color, marginBottom: 4 }}>
            {hasCover ? coverLabel(picture.level) : 'No cover right now'}
          </div>

          <div style={{ color: 'var(--t-3)' }}>
            You can duck behind: <span style={{ color: 'var(--t-2)' }}>{picture.nearby.join(', ')}</span>
          </div>

          {picture.coveredFrom.length > 0 && (
            <div style={{ marginTop: 6, color: 'var(--t-3)' }}>
              Covered from: <span style={{ color: '#4ade80' }}>{picture.coveredFrom.join(', ')}</span>
            </div>
          )}
          {picture.exposedTo.length > 0 && (
            <div style={{ marginTop: 2, color: 'var(--t-3)' }}>
              Exposed to: <span style={{ color: '#f87171' }}>{picture.exposedTo.join(', ')}</span>
            </div>
          )}

          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--c-border)', color: 'var(--t-3)', fontSize: 10 }}>
            Cover applies automatically per attack — it depends on where
            the attacker is standing, so there's nothing to switch on.
          </div>
        </div>
      )}
    </div>
  );
}
