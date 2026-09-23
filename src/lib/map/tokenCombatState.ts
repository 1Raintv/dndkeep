// src/lib/map/tokenCombatState.ts — per-TOKEN combat state for the HP bar.
//
// v2.746.0 — BattleMapV2's liveTokenStateByDef (v2.428) keyed the live
// combat_participants state by `${participant_type}:${entity_id}` with
// "first wins per definition". That was fine while an encounter held one
// participant per creature definition; now that participants are per
// instance (one per token, each with its own combatant_id — see
// combatEncounter.ts seedToRow / startCombatFromMap.ts), three Goblin Scout
// tokens would all draw goblin #1's HP bar. This builder produces the
// per-token map TokenLayer already prefers (`tokenStateMap.get(token.id)`),
// so each token shows ITS OWN participant's HP/conditions:
//   1. the participant whose combatant_id === token.combatantId — the same
//      data path InitiativeStrip / MonsterActionPanel read, so the bar can
//      never disagree with them;
//   2. else the upstream tokenStateMap entry keyed by that combatant id
//      (CampaignDashboard's flat combatants SELECT, for tokens outside the
//      encounter);
//   3. else whatever the upstream map already held for the token id.
// Pure (no React, no store) so it is unit-tested; BattleMapV2 wraps it in a
// one-line useMemo and passes the result as `tokenStateMap`.

export interface TokenCombatState {
  current_hp: number | null;
  max_hp: number | null;
  conditions: string[];
  is_dead: boolean;
}

export interface ParticipantForTokenState {
  combatant_id?: string | null;
  current_hp?: number | null;
  max_hp?: number | null;
  active_conditions?: string[] | null;
  is_dead?: boolean | null;
}

export interface TokenForTokenState {
  id: string;
  combatantId?: string | null;
}

export function buildTokenStateByTokenId(
  participants: readonly ParticipantForTokenState[],
  tokenStateMap: ReadonlyMap<string, TokenCombatState> | null | undefined,
  tokens: readonly TokenForTokenState[] | Record<string, TokenForTokenState>,
): Map<string, TokenCombatState> {
  // Start from a copy so entries for tokens we cannot resolve (legacy
  // scene_tokens path, no combatantId) are preserved untouched.
  const out = new Map<string, TokenCombatState>(tokenStateMap ?? []);
  const byCombatant = new Map<string, ParticipantForTokenState>();
  for (const p of participants) {
    // First participant per combatant wins — a second one is a data error
    // (the v2.746 partial unique index forbids it) and must not flip-flop.
    if (p.combatant_id && !byCombatant.has(p.combatant_id)) byCombatant.set(p.combatant_id, p);
  }
  const list = Array.isArray(tokens) ? tokens : Object.values(tokens);
  for (const t of list) {
    if (!t.combatantId) continue;
    const p = byCombatant.get(t.combatantId);
    if (p) {
      out.set(t.id, {
        current_hp: p.current_hp ?? null,
        max_hp: p.max_hp ?? null,
        conditions: p.active_conditions ?? [],
        is_dead: !!p.is_dead,
      });
      continue;
    }
    // Not in the encounter: the upstream map is keyed by combatants.id,
    // which equals token.id only when the v2.389 sync trigger created the
    // combatant. Re-key it under the token id so TokenLayer's primary
    // lookup hits without the per-definition fallback.
    if (!out.has(t.id)) {
      const upstream = tokenStateMap?.get(t.combatantId);
      if (upstream) out.set(t.id, upstream);
    }
  }
  return out;
}
