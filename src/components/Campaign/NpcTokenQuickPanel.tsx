import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../shared/Toast';
// v2.386.0 — Hide-from-players now writes scene_tokens.visible_to_all
// instead of homebrew_monsters.visible_to_players. The latter was
// never read by any rendering code; the former has full RLS + DM
// faded-render infra and matches what the right-click context-menu
// "Hide from Players" item already does. The toggle finally hides
// things from players for real.
import { useBattleMapStore } from '../../lib/stores/battleMapStore';
import * as tokensApi from '../../lib/api/sceneTokens';
// v2.293.0 — Combat-system Phase 2c migration. The Initiative
// section in this panel used to read/write sessionState.initiative_order
// (the legacy campaign_sessions JSON column). Modern combat lives on
// combat_encounters + combat_participants, accessed here via
// useCombat() which is provided by CampaignDashboard's CombatProvider
// wrapper. The old code path matched by `Combatant.npc_id`; the
// modern equivalent matches by `participant_type='npc' AND
// entity_id=npc.id`.
//
// Behavior changes worth flagging:
//   - The Initiative section is now hidden when there's no active
//     encounter (encounter?.status !== 'active'). The legacy code
//     showed the section whenever sessionState/onUpdateSession were
//     plumbed; you could "add to initiative" outside of combat,
//     which mostly produced confused state. With modern combat,
//     adding-to-initiative without an encounter doesn't have a
//     meaningful target.
//   - Add-to-combat now snapshots HP/AC via npcToSeed (the same
//     path the StartCombatModal uses), keeping the seed shape
//     consistent across all entry points.
//   - Initiative override (the manual input) issues a direct
//     UPDATE on combat_participants.initiative + recomputeTurnOrder
//     so the strip re-sorts immediately.
import { useCombat } from '../../context/CombatContext';
import { npcToSeed, addParticipantToEncounter, recomputeTurnOrder } from '../../lib/combatEncounter';
import { isCreatureParticipantType } from '../../lib/participantType';

/**
 * v2.243.0 — Phase Q.1 pt 31: NPC quick panel.
 *
 * Mirrors v2.226's character TokenQuickPanel but pointed at the
 * `npcs` table. When a DM clicks an NPC-linked token (one with
 * `npcId` set, typically created via v2.242's roster bulk-add),
 * this panel anchors near the click and exposes:
 *   - HP bar + name + AC + roster origin subtitle
 *   - Damage / Heal / Set HP input (DM-only)
 *   - Active conditions chips with apply / remove (DM-only)
 *   - Reveal / Hide toggle for the per-token visibility flag
 *     (scene_tokens.visible_to_all — RLS-enforced; v2.386 fix)
 *   - Close on Esc or backdrop click
 *
 * Loading: the panel does its own one-shot fetch by npcId on mount
 * because BattleMapV2 doesn't maintain an npcs cache. A Realtime
 * channel keyed on this single npc id keeps the panel state in
 * sync with edits from elsewhere (e.g., NPCManager) and with the
 * panel's own writes (no optimistic local update — let the channel
 * echo it).
 *
 * Conditions: writes go through `npcs.conditions text[]` directly,
 * matching v1's pattern (and the character panel's). No combat
 * cascade routing here — same trade-off as character panel.
 */

interface NpcRow {
  id: string;
  campaign_id: string | null;
  name: string;
  race: string | null;          // doubles as monster type for roster-spawned NPCs
  hp: number | null;
  max_hp: number | null;
  ac: number | null;
  // v2.250.0 — removed `dex` field. The `npcs` table doesn't actually
  // carry ability scores (only `dm_npc_roster` does), so the v2.248
  // SELECT was reading a non-existent column. Initiative roll on the
  // panel now uses a flat d20+0 unless the DM types a manual override
  // into the input. v2.251+ candidate: store the dex mod alongside the
  // other combat fields when an NPC is spawned from the roster, so it
  // travels with the token.
  conditions: string[] | null;
  visible_to_players: boolean;
  in_combat: boolean;
}

// Mirror of the character panel's COND_COLOR. Kept inline so the panel
// is self-contained — if the palette ever moves to a shared module,
// both panels can adopt it together.
const COND_COLOR: Record<string, string> = {
  Blinded: '#94a3b8',
  Charmed: '#f472b6',
  Deafened: '#94a3b8',
  Frightened: '#fb923c',
  Grappled: '#a78bfa',
  Incapacitated: '#ef4444',
  Invisible: '#60a5fa',
  Paralyzed: '#ef4444',
  Petrified: '#78716c',
  Poisoned: '#22c55e',
  Prone: '#fbbf24',
  Restrained: '#a78bfa',
  Stunned: '#ef4444',
  Unconscious: '#dc2626',
  Exhaustion: '#7c3aed',
};

const ALL_CONDITIONS: string[] = Object.keys(COND_COLOR);

interface Props {
  npcId: string;
  // v2.386.0 — The scene_tokens.id of the specific token instance
  // that opened the panel. Required for per-token operations (the
  // visibility toggle in particular). v2.393.0 — Now also doubles
  // as the combatant id for per-token HP/conditions reads + writes
  // (combatants.id == scene_tokens.id via the v2.389 sync trigger).
  tokenId: string;
  anchorX: number;
  anchorY: number;
  isDM: boolean;
  onClose: () => void;
  // v2.296.0 — sessionState/onUpdateSession optional props removed.
  // session_states table dropped this ship; the BattleMapV2 mount no
  // longer passes them. Initiative section reads from useCombat()
  // and writes directly to combat_participants.
}

export default function NpcTokenQuickPanel({ npcId, tokenId, anchorX, anchorY, isDM, onClose }: Props) {
  const { showToast } = useToast();
  // v2.293.0 — Modern combat state. encounter is null when no
  // encounter exists; .status is 'pending' | 'active' | 'completed'.
  // The Initiative section gates on 'active' specifically (a
  // 'pending' encounter is the brief setup window between
  // startEncounter and the first turn — the strip itself isn't
  // showing yet so adding here would create a participant the
  // strip wouldn't render correctly).
  const { encounter, participants, refresh: refreshCombat } = useCombat();
  const [npc, setNpc] = useState<NpcRow | null>(null);
  // v2.393.0 — Per-token combat state, sourced from combatants. The
  // v2.389 sync trigger reuses scene_tokens.id as combatants.id, so we
  // can fetch by tokenId. This is what HP/conditions writes target;
  // homebrew_monsters is now ONLY used for template fields (AC, race,
  // visibility, in_combat). Splits the read so the panel reflects the
  // per-instance combat state of THIS specific token, not the shared
  // creature template.
  const [combatant, setCombatant] = useState<{
    id: string;
    current_hp: number | null;
    max_hp: number | null;
    temp_hp: number | null;
    conditions: string[] | null;
    is_dead: boolean | null;
  } | null>(null);
  const [hpInput, setHpInput] = useState('');
  const [hpMode, setHpMode] = useState<'damage' | 'heal' | 'set'>('damage');
  const [applying, setApplying] = useState(false);
  const [condBusy, setCondBusy] = useState(false);
  const [showCondPicker, setShowCondPicker] = useState(false);

  // Initial fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fetch template + combatant in parallel. Both keyed off the
      // panel's two ids: npcId (homebrew_monsters.id) for the template,
      // tokenId (= combatants.id, v2.389 reuse) for the per-token state.
      const [tplRes, combRes] = await Promise.all([
        supabase
          .from('homebrew_monsters')
          .select('id, campaign_id, name, race, hp, max_hp, ac, conditions, visible_to_players, in_combat')
          .eq('id', npcId)
          .single(),
        supabase
          .from('combatants')
          .select('id, current_hp, max_hp, temp_hp, conditions, is_dead')
          .eq('id', tokenId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (tplRes.error || !tplRes.data) {
        console.error('[NpcTokenQuickPanel] template fetch failed', tplRes.error);
        return;
      }
      setNpc(tplRes.data as NpcRow);
      // combRes can legitimately be null on a brief race after token
      // insert and before the v2.389 trigger fires; the panel still
      // renders the template-only view in that case.
      if (combRes.error) {
        console.error('[NpcTokenQuickPanel] combatant fetch failed', combRes.error);
      } else if (combRes.data) {
        setCombatant(combRes.data as any);
      }
    })();
    return () => { cancelled = true; };
  }, [npcId, tokenId]);

  // Realtime sync — listen for UPDATE events on this specific npc id.
  // The filter scoping reduces channel chatter when the campaign has
  // many NPCs. Cleaned up on unmount.
  //
  // v2.385.0 — Bug fix. The channel previously listened on table
  // `npcs` which doesn't exist (the table is `homebrew_monsters` as
  // of the long-ago rename). The channel subscribed cleanly but
  // never received events, so toggle/edit changes only became
  // visible after the panel was closed and reopened (forcing the
  // initial fetch above to re-run). Now points at the right table.
  useEffect(() => {
    const channel = supabase
      .channel(`npc:${npcId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'homebrew_monsters',
          filter: `id=eq.${npcId}`,
        },
        (payload: any) => {
          const next = payload.new;
          if (next?.id === npcId) {
            setNpc(prev => prev ? { ...prev, ...next } : (next as NpcRow));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [npcId]);

  // v2.393.0 — Realtime: per-token combatant state. Combat damage,
  // condition changes, and death flips written to combatants by
  // pendingAttack / advanceTurn / etc. echo here so the panel reflects
  // the current state without forcing the user to close + reopen it.
  // Scoped to this combatant's id (= tokenId) only.
  useEffect(() => {
    const channel = supabase
      .channel(`npc-combatant:${tokenId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'combatants',
          filter: `id=eq.${tokenId}`,
        },
        (payload: any) => {
          const next = payload.new;
          if (next?.id === tokenId) {
            setCombatant(prev => prev ? { ...prev, ...next } : (next as any));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenId]);

  // Esc closes.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Position calc — same logic as character panel (clamp inside viewport).
  const PANEL_W = 280;
  const PANEL_H = 420;
  const margin = 8;
  let left = Math.max(margin, anchorX + 14);
  if (typeof window !== 'undefined') {
    if (left + PANEL_W + margin > window.innerWidth) {
      left = Math.max(margin, anchorX - PANEL_W - 14);
    }
  }
  let top = Math.max(margin, anchorY - PANEL_H / 2);
  if (typeof window !== 'undefined') {
    if (top + PANEL_H + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - PANEL_H - margin);
    }
  }

  const applyHp = useCallback(async () => {
    if (!npc) return;
    const n = parseInt(hpInput.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    // v2.393.0 — HP read/write target moved from homebrew_monsters
    // (creature template — shared by every instance, never read by
    // combat) to combatants (per-token, the canonical Phase 3 source
    // for HP and what combat damage already writes to). Result: panel
    // and combat finally agree on a single source. Falls back to
    // template HP for max only if the combatant row hasn't loaded yet.
    const currHp = combatant?.current_hp ?? npc.hp ?? 0;
    const maxHp = combatant?.max_hp ?? npc.max_hp ?? 0;
    let next = currHp;
    if (hpMode === 'damage') next = Math.max(0, currHp - n);
    else if (hpMode === 'heal') next = Math.min(maxHp || currHp + n, currHp + n);
    else next = Math.max(0, maxHp > 0 ? Math.min(maxHp, n) : n);
    // is_dead flag mirrors HP. v2.393 — combat already does this on
    // damage application; replicating here so panel-side damage hits
    // every visual cue (red X, strikethrough, dead state) consistently.
    const isDead = next <= 0 && maxHp > 0;
    setApplying(true);
    try {
      const { error } = await supabase
        .from('combatants')
        .update({
          current_hp: next,
          is_dead: isDead,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tokenId);
      if (error) {
        console.error('[NpcTokenQuickPanel] HP update failed', error);
        showToast('Failed to update HP. Check console for details.', 'error');
        return;
      }
      setHpInput('');
    } finally {
      setApplying(false);
    }
  }, [npc, combatant, hpInput, hpMode, tokenId, showToast]);

  const addCondition = useCallback(async (cond: string) => {
    if (!npc || condBusy) return;
    // v2.393.0 — Conditions write target moved from homebrew_monsters
    // to combatants for the same reason as HP above. The combatant's
    // conditions array is what combat reads (and now what map renders
    // via tokenStateMap).
    const current = combatant?.conditions ?? [];
    if (current.includes(cond)) return;
    setCondBusy(true);
    try {
      const next = [...current, cond];
      const { error } = await supabase
        .from('combatants')
        .update({ conditions: next, updated_at: new Date().toISOString() })
        .eq('id', tokenId);
      if (error) {
        console.error('[NpcTokenQuickPanel] addCondition failed', error);
        showToast(`Failed to apply ${cond}.`, 'error');
      }
    } finally {
      setCondBusy(false);
    }
  }, [npc, combatant, condBusy, tokenId, showToast]);

  const removeCondition = useCallback(async (cond: string) => {
    if (!npc || condBusy) return;
    const current = combatant?.conditions ?? [];
    if (!current.includes(cond)) return;
    setCondBusy(true);
    try {
      const next = current.filter(x => x !== cond);
      const { error } = await supabase
        .from('combatants')
        .update({ conditions: next, updated_at: new Date().toISOString() })
        .eq('id', tokenId);
      if (error) {
        console.error('[NpcTokenQuickPanel] removeCondition failed', error);
        showToast(`Failed to remove ${cond}.`, 'error');
      }
    } finally {
      setCondBusy(false);
    }
  }, [npc, combatant, condBusy, tokenId, showToast]);

  // v2.386.0 — Visibility toggle. Writes scene_tokens.visible_to_all
  // (the per-token flag) rather than homebrew_monsters.visible_to_players
  // (which the previous implementation wrote and which was a no-op
  // because no rendering code read it).
  //
  // Why per-token: scene_tokens has the RLS infra (players don't
  // receive hidden rows) and the DM-side faded-render visual
  // (container.alpha = 0.4 for hidden tokens). The right-click
  // context menu "Hide from Players" item has been writing this
  // column correctly all along; this just brings the Quick Panel
  // toggle in line so both entry points behave identically.
  //
  // If the same creature has multiple tokens, this only flips the
  // one the panel was opened on. That's intentional and matches
  // the context-menu behavior — DMs can stage multiple instances
  // and reveal them individually.
  //
  // State source: read the live token from the Zustand store, not
  // the homebrew_monsters fetch (which doesn't carry visibility
  // anymore as far as this panel is concerned). Write goes through
  // the same updateTokenFields + tokensApi.updateToken pair the
  // map's applyPatch uses, so the optimistic UI / realtime echo
  // / revert-on-error contract is identical.
  const tokenVisible = useBattleMapStore(s => s.tokens[tokenId]?.visibleToAll ?? true);

  const toggleVisibility = useCallback(async () => {
    const next = !tokenVisible;
    // Optimistic local update.
    useBattleMapStore.getState().updateTokenFields(tokenId, { visibleToAll: next });
    const ok = await tokensApi.updateToken(tokenId, { visibleToAll: next }).catch(err => {
      console.error('[NpcTokenQuickPanel] visibility toggle threw', err);
      return false;
    });
    if (!ok) {
      showToast('Failed to update visibility.', 'error');
      // Revert.
      useBattleMapStore.getState().updateTokenFields(tokenId, { visibleToAll: tokenVisible });
    }
  }, [tokenId, tokenVisible, showToast]);

  // v2.293.0 — Initiative integration via modern combat schema.
  // Match by entity_id (the foreign key combat_participants writes to
  // when seeded from npcToSeed) AND participant_type='npc' so we
  // don't cross-link with a character whose id happens to collide
  // (UUIDs make collision astronomically unlikely, but the type
  // guard is free and matches the legacy npc_id-only intent).
  const myParticipant = participants.find(
    p => isCreatureParticipantType(p.participant_type) && p.entity_id === npcId
  );
  const inCombat = !!myParticipant;
  // The Initiative section additionally requires an active encounter
  // to function — adding-to-initiative without one has no target.
  const canEditInitiative = encounter?.status === 'active';

  const setInitiativeValue = useCallback(async (value: number) => {
    if (!myParticipant || !encounter) return;
    // v2.293.0 — Direct UPDATE on combat_participants.initiative.
    // The InitiativeStrip reads initiative + initiative_tiebreaker
    // to render the order; recomputeTurnOrder writes the resorted
    // turn_order back so the strip re-shuffles immediately. Same
    // path rollInitiativeForParticipant uses internally; we go
    // direct here because rollInitiativeForParticipant also emits
    // an 'initiative_rolled' combat event, which would be wrong for
    // a manual override (no roll happened).
    const { error } = await supabase
      .from('combat_participants')
      .update({ initiative: value })
      .eq('id', myParticipant.id);
    if (error) {
      console.error('[NpcTokenQuickPanel] setInitiativeValue failed', error);
      showToast(`Couldn't set initiative: ${error.message}`, 'error');
      return;
    }
    await recomputeTurnOrder(encounter.id);
    await refreshCombat();
  }, [myParticipant, encounter, refreshCombat, showToast]);

  const rollInitiative = useCallback(async () => {
    if (!npc || !encounter || encounter.status !== 'active') return;
    // v2.293.0 — Flat d20+0 (npcs row doesn't carry dex). Same
    // semantic as the legacy code; v2.251+ candidate: snapshot dex
    // from dm_npc_roster on placement so it travels with the
    // spawned NPC and we can route through
    // rollInitiativeForParticipant for the proper d20+DEX path
    // (which also emits a public 'initiative_rolled' combat event).
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20;
    if (myParticipant) {
      // Re-roll path: just overwrite the existing participant's value.
      await setInitiativeValue(total);
    } else {
      // First-add path: seed via npcToSeed (the same shape
      // StartCombatModal uses), then drop the auto-rolled initiative
      // and write our d20 result. addParticipantToEncounter would
      // auto-roll if we didn't override after, but we want the toast
      // to show the same d20 the DM sees written into the participant
      // row, so we override post-insert.
      const seed = npcToSeed({
        id: npc.id,
        name: npc.name,
        ac: npc.ac ?? undefined,
        // v2.393.0 — current per-token HP. If the panel is open,
        // user might have just damaged the token; we don't want to
        // seed combat with full template HP and undo their work.
        hp: combatant?.current_hp ?? npc.hp ?? undefined,
        max_hp: combatant?.max_hp ?? npc.max_hp ?? undefined,
      });
      const created = await addParticipantToEncounter(
        encounter.id,
        encounter.campaign_id,
        seed,
      );
      if (!created) {
        showToast('Failed to add NPC to combat.', 'error');
        return;
      }
      const { error } = await supabase
        .from('combat_participants')
        .update({ initiative: total })
        .eq('id', created.id);
      if (error) {
        console.error('[NpcTokenQuickPanel] post-insert init override failed', error);
        // Soft-fail: the participant exists, just with the auto-roll
        // value instead of our d20. Don't toast; show the toast for
        // the successful add below so the DM still gets feedback.
      }
      await recomputeTurnOrder(encounter.id);
      await refreshCombat();
    }
    showToast(`Rolled ${d20}`, 'info');
  }, [npc, encounter, myParticipant, setInitiativeValue, showToast, refreshCombat]);

  const removeFromCombat = useCallback(async () => {
    if (!myParticipant || !encounter) return;
    // v2.293.0 — Hard delete the combat_participants row. The
    // realtime sub on combat_participants in CombatProvider will
    // drop the row from the strip; recomputeTurnOrder fills the
    // turn_order gap so the next-turn flow doesn't skip.
    const { error } = await supabase
      .from('combat_participants')
      .delete()
      .eq('id', myParticipant.id);
    if (error) {
      console.error('[NpcTokenQuickPanel] removeFromCombat failed', error);
      showToast(`Couldn't remove from combat: ${error.message}`, 'error');
      return;
    }
    await recomputeTurnOrder(encounter.id);
    await refreshCombat();
  }, [myParticipant, encounter, refreshCombat, showToast]);

  function stop(e: React.MouseEvent) { e.stopPropagation(); }

  // Loading state — fetch hasn't returned yet. Render a tiny stub so
  // the panel anchors don't visibly flicker.
  if (!npc) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
        onMouseDown={onClose}
      >
        <div
          style={{
            position: 'fixed', left, top,
            width: PANEL_W, padding: 14,
            background: 'var(--c-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-lg, 12px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            color: 'var(--t-3)', fontFamily: 'var(--ff-body)', fontSize: 12,
          }}
          onMouseDown={stop}
        >
          Loading…
        </div>
      </div>
    );
  }

  // Loaded — render the panel.
  // v2.393.0 — Display values come from combatant (per-token) when
  // available, falling back to npc (template) for the legacy case
  // where the v2.389 sync trigger hasn't fired yet for a freshly
  // placed token. Same precedence as the panel's writes for
  // consistency.
  const currHp = combatant?.current_hp ?? npc.hp ?? 0;
  const maxHp = combatant?.max_hp ?? npc.max_hp ?? 0;
  const pct = maxHp > 0 ? Math.max(0, Math.min(1, currHp / maxHp)) : 0;
  const hpColor = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : pct > 0 ? '#f87171' : '#6b7280';
  const conditions = combatant?.conditions ?? npc.conditions ?? [];
  const availableConds = ALL_CONDITIONS.filter(c => !conditions.includes(c));

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
      onMouseDown={onClose}
    >
      <div
        style={{
          position: 'fixed', left, top,
          width: PANEL_W,
          maxHeight: PANEL_H,
          overflowY: 'auto',
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg, 12px)',
          // Red-tinted shadow ring (NPC = hostile by default in v2.242).
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(239,68,68,0.30)',
          fontFamily: 'var(--ff-body)',
          color: 'var(--t-1)',
          padding: 14,
        }}
        onMouseDown={stop}
      >
        {/* Header — name, type subtitle, close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--t-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {npc.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t-3)', letterSpacing: '0.04em', marginTop: 2 }}>
              {npc.race || 'NPC'}{npc.in_combat && ' · in combat'}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              width: 24, height: 24, padding: 0,
              background: 'transparent', border: 'none',
              color: 'var(--t-3)', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, minHeight: 0, minWidth: 0,
            }}
          >×</button>
        </div>

        {/* HP bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>HP</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: hpColor }}>
              {currHp}<span style={{ fontSize: 10, color: 'var(--t-3)' }}>/{maxHp}</span>
            </span>
          </div>
          <div style={{
            height: 8, background: 'rgba(15,16,18,0.85)',
            border: '1px solid var(--c-border)',
            borderRadius: 4, overflow: 'hidden' as const,
          }}>
            <div style={{
              width: `${pct * 100}%`, height: '100%',
              background: hpColor, transition: 'width 0.2s, background 0.2s',
            }} />
          </div>
        </div>

        {/* AC + Visibility */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{
            background: 'var(--c-raised)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            padding: '6px 8px',
            textAlign: 'center' as const,
          }}>
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>AC</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-1)' }}>{npc.ac ?? '—'}</div>
          </div>
          <button
            onClick={isDM ? toggleVisibility : undefined}
            disabled={!isDM}
            title={isDM
              ? (tokenVisible ? 'Hide this token from players' : 'Reveal this token to players')
              : 'Visibility (DM only)'}
            style={{
              background: tokenVisible ? 'rgba(52,211,153,0.18)' : 'var(--c-raised)',
              border: `1px solid ${tokenVisible ? 'rgba(52,211,153,0.55)' : 'var(--c-border)'}`,
              borderRadius: 'var(--r-sm, 4px)',
              padding: '6px 8px',
              textAlign: 'center' as const,
              cursor: isDM ? 'pointer' : 'default',
              minHeight: 0,
            }}
          >
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Players</div>
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: tokenVisible ? '#34d399' : 'var(--t-3)',
            }}>
              {tokenVisible ? 'Visible' : 'Hidden'}
            </div>
          </button>
        </div>

        {/* v2.293.0 — Initiative section. Reads from useCombat() to
            find this NPC's combat_participant entry (matched by
            entity_id + participant_type='npc'). DM-only controls:
            [Roll d20] adds to combat with the rolled total if not
            present, re-rolls otherwise; manual input sets the value
            directly; [Remove] tears down the participant row.
            Hidden when there's no active encounter — combat must
            be running for adding-to-initiative to have a target.
            Modern combat schema gate. Hidden when there's
            no active encounter (was: hidden when sessionState/
            onUpdateSession weren't plumbed). With the modern path,
            the section only does something useful while combat is
            running; outside of combat there's no encounter to add to. */}
        {isDM && canEditInitiative && (
          <div style={{
            marginBottom: 12,
            padding: '8px 10px',
            background: inCombat ? 'rgba(212,160,23,0.06)' : 'var(--c-raised)',
            border: `1px solid ${inCombat ? 'rgba(212,160,23,0.35)' : 'var(--c-border)'}`,
            borderRadius: 'var(--r-sm, 4px)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6,
            }}>
              <span style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Initiative
              </span>
              {inCombat && (
                <button
                  onClick={removeFromCombat}
                  title="Remove this NPC from the initiative order"
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--t-3)', cursor: 'pointer',
                    fontSize: 9, fontWeight: 700, padding: 0,
                    minHeight: 0, minWidth: 0, letterSpacing: '0.06em',
                  }}
                >
                  REMOVE
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Init chip — current value or em-dash when not in combat */}
              <div style={{
                flexShrink: 0,
                minWidth: 44, padding: '4px 8px',
                background: inCombat ? 'rgba(212,160,23,0.14)' : 'transparent',
                border: `1px solid ${inCombat ? 'rgba(212,160,23,0.45)' : 'var(--c-border)'}`,
                borderRadius: 4,
                textAlign: 'center' as const,
                fontFamily: 'var(--ff-stat)', fontSize: 16, fontWeight: 800,
                color: inCombat ? 'var(--c-gold-l)' : 'var(--t-3)',
              }}>
                {/* v2.293.0 — was: myCombatant?.initiative. Now reads
                    from the modern CombatParticipant whose initiative
                    is `number | null`. Render '—' for the null case
                    (a participant exists with no initiative rolled
                    yet — possible in initiative_mode='player_agency'). */}
                {myParticipant?.initiative ?? '—'}
              </div>
              {/* Manual override input — only enabled when in combat */}
              <input
                type="number"
                disabled={!inCombat}
                placeholder="set"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (Number.isFinite(v)) {
                      setInitiativeValue(v);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
                style={{
                  flex: 1, minWidth: 0,
                  padding: '4px 6px',
                  background: 'var(--c-card)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 4,
                  color: 'var(--t-1)', fontSize: 11,
                  opacity: inCombat ? 1 : 0.5,
                }}
              />
              {/* Roll button — auto-adds to combat if not already present */}
              <button
                onClick={rollInitiative}
                title={inCombat
                  ? 'Re-roll initiative (d20 + DEX mod if available)'
                  : 'Roll d20 + DEX mod and add to combat'}
                style={{
                  flexShrink: 0,
                  padding: '4px 10px',
                  background: 'rgba(212,160,23,0.15)',
                  border: '1px solid rgba(212,160,23,0.5)',
                  borderRadius: 4,
                  color: 'var(--c-gold-l)',
                  fontSize: 11, fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {inCombat ? '↻ Roll' : '+ Roll'}
              </button>
            </div>
          </div>
        )}

        {/* Active conditions chips. DM clicks ✕ to remove, "+" to open picker. */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Conditions
            </span>
            {isDM && (
              <button
                onClick={() => setShowCondPicker(s => !s)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--t-3)', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, padding: 0, minHeight: 0, minWidth: 0,
                }}
              >
                {showCondPicker ? '✕ close' : '+ apply'}
              </button>
            )}
          </div>
          {conditions.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--t-3)', fontStyle: 'italic' as const }}>
              None applied.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
              {conditions.map(cond => {
                const color = COND_COLOR[cond] ?? '#9ca3af';
                return (
                  <span
                    key={cond}
                    onClick={isDM ? () => removeCondition(cond) : undefined}
                    title={isDM ? `Remove ${cond}` : cond}
                    style={{
                      padding: '2px 8px',
                      background: color + '22',
                      border: `1px solid ${color}55`,
                      borderRadius: 999,
                      fontSize: 10, fontWeight: 700,
                      color,
                      cursor: isDM ? 'pointer' : 'default',
                      opacity: condBusy ? 0.6 : 1,
                      pointerEvents: condBusy ? 'none' : 'auto',
                      userSelect: 'none' as const,
                    }}
                  >
                    {cond}{isDM && ' ✕'}
                  </span>
                );
              })}
            </div>
          )}
          {/* Picker — DM only, expanded with all unapplied conditions. */}
          {isDM && showCondPicker && availableConds.length > 0 && (
            <div style={{
              marginTop: 6, padding: 6,
              background: 'var(--c-raised)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm, 4px)',
              display: 'flex', flexWrap: 'wrap' as const, gap: 3,
            }}>
              {availableConds.map(cond => {
                const color = COND_COLOR[cond] ?? '#9ca3af';
                return (
                  <button
                    key={cond}
                    onClick={() => { addCondition(cond); }}
                    style={{
                      padding: '2px 8px',
                      background: 'transparent',
                      border: `1px solid ${color}55`,
                      borderRadius: 999,
                      fontSize: 10, fontWeight: 700,
                      color,
                      cursor: 'pointer',
                      opacity: condBusy ? 0.5 : 1,
                      minHeight: 0,
                    }}
                  >
                    + {cond}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* DM controls — damage / heal / set */}
        {isDM && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              DM Controls
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 6 }}>
              {(['damage', 'heal', 'set'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setHpMode(m)}
                  style={{
                    padding: '6px 4px',
                    background: hpMode === m
                      ? (m === 'damage' ? 'rgba(248,113,113,0.25)' : m === 'heal' ? 'rgba(52,211,153,0.25)' : 'rgba(167,139,250,0.25)')
                      : 'var(--c-raised)',
                    border: `1px solid ${hpMode === m
                      ? (m === 'damage' ? 'rgba(248,113,113,0.6)' : m === 'heal' ? 'rgba(52,211,153,0.6)' : 'rgba(167,139,250,0.6)')
                      : 'var(--c-border)'}`,
                    borderRadius: 'var(--r-sm, 4px)',
                    color: hpMode === m
                      ? (m === 'damage' ? '#f87171' : m === 'heal' ? '#34d399' : '#a78bfa')
                      : 'var(--t-2)',
                    fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                    textTransform: 'capitalize' as const, cursor: 'pointer',
                    minHeight: 0,
                  }}
                >{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                value={hpInput}
                onChange={(e) => setHpInput(e.target.value)}
                placeholder="Amount"
                min={0}
                style={{
                  flex: 1, padding: '6px 8px',
                  background: 'var(--c-raised)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: 'var(--t-1)',
                  fontFamily: 'var(--ff-body)', fontSize: 12,
                  boxSizing: 'border-box' as const,
                  outline: 'none',
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyHp(); }}
              />
              <button
                onClick={applyHp}
                disabled={applying || !hpInput.trim()}
                style={{
                  padding: '6px 12px',
                  background: hpMode === 'damage' ? 'rgba(248,113,113,0.18)'
                    : hpMode === 'heal' ? 'rgba(52,211,153,0.18)'
                    : 'rgba(167,139,250,0.18)',
                  border: `1px solid ${hpMode === 'damage' ? 'rgba(248,113,113,0.55)'
                    : hpMode === 'heal' ? 'rgba(52,211,153,0.55)'
                    : 'rgba(167,139,250,0.55)'}`,
                  borderRadius: 'var(--r-sm, 4px)',
                  color: hpMode === 'damage' ? '#f87171'
                    : hpMode === 'heal' ? '#34d399'
                    : '#a78bfa',
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                  cursor: applying || !hpInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: applying || !hpInput.trim() ? 0.5 : 1,
                  minHeight: 0,
                  textTransform: 'capitalize' as const,
                }}
              >
                {applying ? '…' : hpMode}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
