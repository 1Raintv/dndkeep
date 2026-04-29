// v2.363.0 — Phase Q.2 pt 1: Monster action panel.
//
// DM-only floating panel that appears when a creature-typed
// participant is the active turn in an active combat encounter.
// Loads the monster's stat-block actions from the SRD catalog
// (joined via homebrew_monsters.source_monster_id) and renders
// a clickable list — each plain melee/ranged attack routes through
// the existing pendingAttack pipeline (declareAttack +
// rollAttackRoll → DM AttackResolutionModal handles damage/apply).
//
// Action flavors recognized in monsters.actions[]:
//
//   PLAIN ATTACK  — has `attack_bonus` + `damage_dice` + `damage_type`.
//                   Optional `bonus_damage_dice`/`bonus_damage_type`
//                   for riders (Bite's 2d6 fire on top of 2d10+8
//                   piercing). v2.363 only declares the primary
//                   damage; bonus rider gets a tooltip hint and
//                   the DM applies it manually until v2.364 extends
//                   the schema.
//
//   SAVE-OR-SUCK  — has `dc_type` + `dc_value` + `dc_success`.
//                   Fire Breath, Frightful Presence, etc. v2.363
//                   renders these disabled with a "v2.365" tooltip.
//
//   RECHARGE      — has `usage: "recharge on roll"`. v2.363 ignores
//                   the gate; v2.364 will track the recharge die.
//
//   DESCRIPTIVE   — Multiattack and similar entries with no
//                   mechanical fields. Rendered as a hint card so
//                   the DM remembers the multiattack pattern (e.g.
//                   "Bite + 2× Claw" for Adult Red Dragon).
//
// Mount point: CampaignDashboard, alongside InitiativeStrip. Visible
// whenever the DM is viewing a campaign with an active encounter
// AND the current actor is a creature. Self-hides for player-actor
// turns (PCs use their own character sheet's attack buttons).

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCombat } from '../../context/CombatContext';
import { supabase } from '../../lib/supabase';
import { declareAttack, rollAttackRoll } from '../../lib/pendingAttack';
import TargetPickerModal from './TargetPickerModal';
import type { CombatParticipant } from '../../types';

interface MonsterAction {
  name: string;
  desc?: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_type?: string;
  bonus_damage_dice?: string;
  bonus_damage_type?: string;
  dc_type?: string;
  dc_value?: number;
  dc_success?: 'none' | 'half' | 'other';
  usage?: string;
}

type ActionFlavor = 'attack' | 'save' | 'descriptive';

function classifyAction(a: MonsterAction): ActionFlavor {
  if (typeof a.attack_bonus === 'number' && a.damage_dice) return 'attack';
  if (a.dc_type && typeof a.dc_value === 'number') return 'save';
  return 'descriptive';
}

interface Props {
  isDM: boolean;
}

export default function MonsterActionPanel({ isDM }: Props) {
  const { encounter, participants, currentActor } = useCombat();
  const [actions, setActions] = useState<MonsterAction[] | null>(null);
  const [loadingActions, setLoadingActions] = useState(false);
  const [pickingFor, setPickingFor] = useState<MonsterAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Load actions for the current creature actor. Two-step: fetch the
  // homebrew_monsters row for source_monster_id, then the SRD
  // monsters row for the actions JSON. Cached implicitly by
  // currentActor.id changing.
  useEffect(() => {
    if (!isDM || !currentActor) {
      setActions(null);
      return;
    }
    if (currentActor.participant_type !== 'creature') {
      setActions(null);
      return;
    }
    if (!currentActor.entity_id) {
      setActions(null);
      return;
    }

    let cancelled = false;
    setLoadingActions(true);
    (async () => {
      // Step 1: get the source slug from homebrew_monsters.
      const { data: hb } = await supabase
        .from('homebrew_monsters')
        .select('source_monster_id')
        .eq('id', currentActor.entity_id)
        .maybeSingle();
      if (cancelled) return;
      const sourceId = (hb as { source_monster_id?: string } | null)?.source_monster_id;
      if (!sourceId) {
        // Custom monster with no SRD source — no canned action list.
        // (Future: surface homebrew_monsters.attack_bonus +
        // attack_damage as a single synthesized action so the panel
        // isn't completely empty for hand-rolled NPCs.)
        setActions([]);
        setLoadingActions(false);
        return;
      }
      // Step 2: get the actions array from the SRD catalog.
      const { data: m } = await supabase
        .from('monsters')
        .select('actions')
        .eq('id', sourceId)
        .maybeSingle();
      if (cancelled) return;
      const arr = (m as { actions?: MonsterAction[] | null } | null)?.actions ?? [];
      setActions(Array.isArray(arr) ? arr : []);
      setLoadingActions(false);
    })().catch(err => {
      if (!cancelled) {
        console.error('[MonsterActionPanel] action load failed', err);
        setActions([]);
        setLoadingActions(false);
      }
    });
    return () => { cancelled = true; };
  }, [isDM, currentActor]);

  // Visibility gates. Computed before short-circuit returns so hooks
  // ordering is stable across renders.
  const visible = useMemo(() => {
    if (!isDM) return false;
    if (!encounter || encounter.status !== 'active') return false;
    if (!currentActor) return false;
    if (currentActor.participant_type !== 'creature') return false;
    return true;
  }, [isDM, encounter, currentActor]);

  if (!visible) return null;

  async function handlePick(target: CombatParticipant) {
    if (!encounter || !currentActor || !pickingFor) return;
    if (busy) return;
    const a = pickingFor;
    setPickingFor(null);
    setBusy(true);
    try {
      const attack = await declareAttack({
        campaignId: encounter.campaign_id,
        encounterId: encounter.id,
        attackerParticipantId: currentActor.id,
        attackerName: currentActor.name,
        attackerType: 'creature',
        targetParticipantId: target.id,
        targetName: target.name,
        targetType: target.participant_type,
        attackSource: 'monster_action',
        attackName: a.name,
        attackKind: 'attack_roll',
        attackBonus: a.attack_bonus ?? 0,
        targetAC: target.ac,
        damageDice: a.damage_dice ?? null,
        damageType: a.damage_type ?? null,
      });
      if (attack) {
        await rollAttackRoll(attack.id);
      }
    } catch (err) {
      console.error('[MonsterActionPanel] attack declare/roll failed', err);
    } finally {
      setBusy(false);
    }
  }

  // Build the action rows. Each row gets a flavor + a button or info
  // surface based on type. Buttons disable while another attack is
  // mid-roll so the DM doesn't double-fire.
  const rows = (actions ?? []).map((a, i) => ({
    key: `${a.name}-${i}`,
    flavor: classifyAction(a),
    action: a,
  }));

  // Panel chrome. Anchored bottom-right, above the InitiativeStrip
  // (which sits at bottom:0). zIndex above the strip's 9999 so the
  // panel reads as the foreground action surface during the DM's
  // turn. Fixed-positioned via portal to escape any animate-fade-in
  // containing block (same fix as v2.362's TokenContextMenu).
  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 88, // strip is ~64-72px tall; clear it
        right: 96,  // clear the dice fab cluster (same logic as InitiativeStrip)
        width: 320,
        maxHeight: 'calc(100vh - 200px)',
        background: 'rgba(19, 19, 29, 0.96)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(248,113,113,0.55)',
        borderRadius: 'var(--r-md, 8px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--ff-body)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--c-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#f87171',
            }}
          >
            Monster Actions
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--t-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={currentActor!.name}
          >
            {currentActor!.name}
          </div>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            width: 24, height: 24, padding: 0,
            background: 'transparent',
            border: '1px solid var(--c-border)',
            borderRadius: 4,
            color: 'var(--t-2)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loadingActions && (
            <div style={{ fontSize: 11, color: 'var(--t-3)', padding: 8 }}>
              Loading actions…
            </div>
          )}
          {!loadingActions && rows.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--t-3)', padding: 8, lineHeight: 1.4 }}>
              No catalog actions found for this creature. Custom NPCs without an SRD source don't have a stat-block list yet — coming in a future ship.
            </div>
          )}
          {!loadingActions && rows.map(({ key, flavor, action }) => {
            if (flavor === 'attack') {
              const hasBonusRider = !!(action.bonus_damage_dice && action.bonus_damage_type);
              const ab = action.attack_bonus ?? 0;
              const sub = `${ab >= 0 ? '+' : ''}${ab} to hit · ${action.damage_dice} ${action.damage_type}${hasBonusRider ? ` + ${action.bonus_damage_dice} ${action.bonus_damage_type}` : ''}`;
              return (
                <button
                  key={key}
                  onClick={() => setPickingFor(action)}
                  disabled={busy}
                  title={(action.desc || sub) + (hasBonusRider ? '\n\n⚠ Rider damage (' + action.bonus_damage_dice + ' ' + action.bonus_damage_type + ') is shown on the attack but applied manually for now (v2.364 will roll it automatically).' : '')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'rgba(248,113,113,0.10)',
                    border: '1px solid rgba(248,113,113,0.45)',
                    borderRadius: 4,
                    color: 'var(--t-1)',
                    fontFamily: 'var(--ff-body)',
                    cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#fca5a5' }}>
                    ⚔ {action.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--t-2)', fontWeight: 600 }}>
                    {sub}
                  </span>
                </button>
              );
            }
            if (flavor === 'save') {
              const sub = `DC ${action.dc_value} ${action.dc_type}${action.damage_dice ? ` · ${action.damage_dice} ${action.damage_type ?? ''}` : ''}${action.usage === 'recharge on roll' ? ' · Recharge 5–6' : ''}`;
              return (
                <div
                  key={key}
                  title={action.desc + '\n\nResolve manually for now. Auto-resolution comes in v2.365 (save-or-suck) / v2.364 (recharge gate).'}
                  style={{
                    padding: '8px 10px',
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px dashed rgba(167,139,250,0.4)',
                    borderRadius: 4,
                    color: 'var(--t-2)',
                    cursor: 'help',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>
                    💫 {action.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 600 }}>
                    {sub} · resolve manually
                  </span>
                </div>
              );
            }
            // descriptive (Multiattack et al.)
            return (
              <div
                key={key}
                title={action.desc}
                style={{
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 4,
                  color: 'var(--t-2)',
                  cursor: 'help',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-1)' }}>
                  ℹ {action.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--t-3)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {action.desc}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {pickingFor && (
        <TargetPickerModal
          participants={participants}
          excludeParticipantId={currentActor!.id}
          title={`Attack with ${pickingFor.name}`}
          subtitle={`${(pickingFor.attack_bonus ?? 0) >= 0 ? '+' : ''}${pickingFor.attack_bonus ?? 0} to hit · ${pickingFor.damage_dice} ${pickingFor.damage_type}`}
          onPick={handlePick}
          onCancel={() => setPickingFor(null)}
        />
      )}
    </div>,
    document.body,
  );
}
