// v2.616.0 — Phase B2 of the playable-forms arc
// (docs/PLAYABLE_FORMS_AND_MINIONS.md): player minion control panel.
//
// Lists combatants the CURRENT USER owns in this campaign that carry a
// real statblock (definition_type 'srd_monster' — familiars and future
// creature summons from v2.615). For each minion: HP stepper, rollable
// statblock actions (same local-roll pattern as BeastFormActions), and
// Dismiss (deletes placements then the combatant, mirroring
// removeSummonTokens' order).
//
// Per Jared's visibility rule: renders nothing unless the user
// actually owns a living minion here — and only that minion's own
// actions. RLS backing (v2.616 migration): players can SELECT/UPDATE/
// DELETE combatants where owner_id = auth.uid(), and manage placements
// of combatants they own. DM monsters remain invisible/untouchable.
//
// Note: hidden while the owner is in Wild Shape? No — RAW lets a
// shaped druid keep a familiar; both panels can coexist.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { rollDie } from '../../lib/gameUtils';
import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDiceExpr } from '../../lib/buffs';
import type { Character } from '../../types';

interface MinionPanelProps {
  character: Character;
}

interface MinionRow {
  id: string;
  name: string;
  definition_id: string | null;
  current_hp: number | null;
  max_hp: number | null;
  temp_hp: number | null;
}

interface MinionAction {
  name: string;
  desc?: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_type?: string;
}

export default function MinionPanel({ character }: MinionPanelProps) {
  const [minions, setMinions] = useState<MinionRow[]>([]);
  const [actionsById, setActionsById] = useState<Record<string, MinionAction[]>>({});
  const { triggerRoll } = useDiceRoll();
  const logHistory = character.id && character.user_id
    ? { characterId: character.id, userId: character.user_id }
    : undefined;

  const campaignId = character.campaign_id;

  const refresh = useCallback(async () => {
    if (!campaignId) { setMinions([]); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) { setMinions([]); return; }
    const { data } = await (supabase as any)
      .from('combatants')
      .select('id, name, definition_id, current_hp, max_hp, temp_hp')
      .eq('campaign_id', campaignId)
      .eq('owner_id', uid)
      .eq('definition_type', 'srd_monster')
      .eq('is_dead', false);
    const rows = ((data as MinionRow[] | null) ?? []);
    setMinions(rows);
    // Fetch statblock actions for any definition ids we haven't cached.
    const needed = [...new Set(rows.map(r => r.definition_id).filter((d): d is string => !!d))];
    if (needed.length) {
      const { data: ms } = await supabase
        .from('monsters')
        .select('id, actions')
        .in('id', needed);
      const map: Record<string, MinionAction[]> = {};
      for (const m of (ms as any[] | null) ?? []) map[m.id] = (m.actions as MinionAction[] | null) ?? [];
      setActionsById(prev => ({ ...prev, ...map }));
    }
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!campaignId || minions.length === 0) return null;

  function adjustHp(m: MinionRow, delta: number) {
    const max = m.max_hp ?? 1;
    const next = Math.max(0, Math.min(max, (m.current_hp ?? 0) + delta));
    setMinions(list => list.map(x => x.id === m.id ? { ...x, current_hp: next } : x));
    void (supabase as any).from('combatants').update({ current_hp: next }).eq('id', m.id);
  }

  async function dismiss(m: MinionRow) {
    // Placements first (FK), then the combatant — same order as
    // removeSummonTokens.
    await (supabase as any).from('scene_token_placements').delete().eq('combatant_id', m.id);
    await (supabase as any).from('combatants').delete().eq('id', m.id);
    refresh();
  }

  function rollHit(m: MinionRow, a: MinionAction) {
    const bonus = a.attack_bonus ?? 0;
    const nat = rollDie(20);
    triggerRoll({
      result: nat, dieType: 20, modifier: bonus, total: nat + bonus,
      label: `${m.name} — ${a.name} (to hit)`,
      logHistory,
    });
  }

  function rollDamage(m: MinionRow, a: MinionAction) {
    if (!a.damage_dice) return;
    const dm = a.damage_dice.replace(/\s/g, '').match(/^(\d+d\d+)([+-]\d+)?$/i);
    if (!dm) return;
    const dieSize = parseInt(dm[1].split('d')[1], 10);
    const flat = dm[2] ? parseInt(dm[2], 10) : 0;
    const { rolls, total } = rollDiceExpr(dm[1]);
    triggerRoll({
      result: rolls[0] ?? total, dieType: dieSize, modifier: flat, total: total + flat,
      allDice: rolls.map(v => ({ die: dieSize, value: v })),
      expression: a.damage_dice,
      label: `${m.name} — ${a.name} (${a.damage_type ?? 'damage'})`,
      logHistory,
    });
  }

  return (
    <div style={{
      padding: '8px 14px', borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
      background: 'rgba(103,232,249,0.04)',
      border: '1px solid rgba(103,232,249,0.3)',
    }}>
      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 11, color: '#67e8f9', letterSpacing: '0.04em' }}>
        MINIONS
      </span>
      {minions.map(m => {
        const acts = (m.definition_id && actionsById[m.definition_id]) || [];
        const hp = m.current_hp ?? 0;
        const max = m.max_hp ?? 1;
        return (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, color: 'var(--t-1)' }}>
                {m.name}
              </span>
              <span style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                color: hp === 0 ? '#fca5a5' : 'var(--t-2)', flexShrink: 0,
              }}>
                HP {hp}/{max}{(m.temp_hp ?? 0) > 0 ? ` (+${m.temp_hp})` : ''}
              </span>
              <button
                onClick={() => adjustHp(m, -1)}
                title="Take 1 damage"
                style={{
                  fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 11, minHeight: 0,
                  padding: '0 7px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5',
                }}
              >
                −
              </button>
              <button
                onClick={() => adjustHp(m, 1)}
                title="Heal 1"
                style={{
                  fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 11, minHeight: 0,
                  padding: '0 7px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80',
                }}
              >
                +
              </button>
              <span style={{ flex: 1 }} />
              <button
                onClick={() => dismiss(m)}
                title="Dismiss: removes the minion and its map token"
                style={{
                  fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, minHeight: 0,
                  padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.3)', color: 'var(--t-3)',
                }}
              >
                Dismiss
              </button>
            </div>
            {acts.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 4 }}>
                {acts.map((a, i) => a.attack_bonus != null ? (
                  <span key={`${a.name}-${i}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <button
                      onClick={() => rollHit(m, a)}
                      title={`${a.name}: d20 ${a.attack_bonus >= 0 ? '+' : ''}${a.attack_bonus} to hit`}
                      style={{
                        fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, minHeight: 0,
                        padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                        background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.4)', color: '#93c5fd',
                      }}
                    >
                      {a.name} {a.attack_bonus >= 0 ? '+' : ''}{a.attack_bonus}
                    </button>
                    {a.damage_dice && (
                      <button
                        onClick={() => rollDamage(m, a)}
                        title={`Damage: ${a.damage_dice} ${a.damage_type ?? ''}`}
                        style={{
                          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, minHeight: 0,
                          padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5',
                        }}
                      >
                        {a.damage_dice}
                      </button>
                    )}
                  </span>
                ) : null)}
              </div>
            )}
          </div>
        );
      })}
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)' }}>
        2024: your familiar can't Attack (it can take other actions); summons act right after your turn.
      </span>
    </div>
  );
}
