// v2.613.0 — Phase A2 of the playable-forms arc
// (docs/PLAYABLE_FORMS_AND_MINIONS.md): rollable Beast Form actions
// on the character sheet while Wild Shape is active.
//
// Data source: the `monsters` catalogue row whose id is stored in
// wildshape_beast_name (set by the A1 picker, v2.612). The actions
// jsonb is already parsed (attack_bonus / damage_dice / damage_type
// per action), so rolls are sheet-local: d20 + bonus for HIT,
// rollDiceExpr for DMG — same 3D dice + history pipeline the
// WeaponsTracker uses.
//
// 2024 statblock rules surfaced in the banner:
//   - AC: Circle of the Moon (L3+) uses max(13 + WIS mod, beast AC),
//     per Circle Forms; others use the beast's AC.
//   - Speeds and senses come from the form.
//   - Retained-rules reminder (own HP, mental scores, saves/skills
//     higher-of) kept to a tooltip to avoid sheet noise.
//
// Per Jared's product rule (v2.612): this renders ONLY what the
// player can currently use — the section exists solely while shaped,
// and shows only the assumed form's own actions.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { rollDie, abilityModifier } from '../../lib/gameUtils';
import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDiceExpr } from '../../lib/buffs';
import type { Character } from '../../types';

interface BeastFormActionsProps {
  character: Character;
  isMoon: boolean;
}

interface BeastAction {
  name: string;
  desc?: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_type?: string;
}

interface BeastStatRow {
  id: string;
  name: string;
  ac: number | null;
  speed: number | null;
  fly_speed: number | null;
  swim_speed: number | null;
  climb_speed: number | null;
  burrow_speed: number | null;
  senses: Record<string, unknown> | null;
  actions: BeastAction[] | null;
}

export default function BeastFormActions({ character, isMoon }: BeastFormActionsProps) {
  const formId = character.wildshape_beast_name;
  const [beast, setBeast] = useState<BeastStatRow | null>(null);
  const { triggerRoll } = useDiceRoll();
  const logHistory = character.id && character.user_id
    ? { characterId: character.id, userId: character.user_id }
    : undefined;

  useEffect(() => {
    if (!formId) { setBeast(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('monsters')
        .select('id, name, ac, speed, fly_speed, swim_speed, climb_speed, burrow_speed, senses, actions')
        .eq('id', formId)
        .maybeSingle();
      if (!cancelled) setBeast((data as BeastStatRow | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [formId]);

  if (!formId || !beast) return null;

  // 2024 Circle Forms: AC = 13 + WIS mod, or the beast's AC if higher.
  const wisMod = abilityModifier(character.wisdom);
  const beastAc = beast.ac ?? 10;
  const ac = isMoon ? Math.max(13 + wisMod, beastAc) : beastAc;
  const acNote = isMoon && 13 + wisMod > beastAc ? ' (13 + WIS)' : '';

  const speeds: string[] = [];
  if (beast.speed) speeds.push(`${beast.speed} ft.`);
  if (beast.climb_speed) speeds.push(`climb ${beast.climb_speed}`);
  if (beast.swim_speed) speeds.push(`swim ${beast.swim_speed}`);
  if (beast.fly_speed) speeds.push(`fly ${beast.fly_speed}`);
  if (beast.burrow_speed) speeds.push(`burrow ${beast.burrow_speed}`);
  const pp = (beast.senses as any)?.passive_perception as number | undefined;

  function rollHit(a: BeastAction) {
    const bonus = a.attack_bonus ?? 0;
    const nat = rollDie(20);
    triggerRoll({
      result: nat, dieType: 20, modifier: bonus, total: nat + bonus,
      label: `${beast!.name} — ${a.name} (to hit)`,
      logHistory,
    });
  }

  // v2.614.0 — Phase A3: level-gated damage riders. Per Jared's
  // visibility rule, chips render ONLY when the level/subclass gate is
  // met. Elemental Fury's Primal-vs-Potent choice isn't tracked yet
  // (follow-up), so the Primal Strike chip carries an explicit
  // "only if you chose it" label.
  const primalDice = character.level >= 15 ? '2d8' : '1d8';
  const showPrimal = character.level >= 7;
  const showLunar = isMoon && character.level >= 14;
  const moonRadiantOption = isMoon && character.level >= 6;

  function rollRider(dice: string, label: string) {
    const m = dice.match(/^(\d+)d(\d+)$/);
    if (!m) return;
    const dieSize = parseInt(m[2], 10);
    const { rolls, total } = rollDiceExpr(dice);
    triggerRoll({
      result: rolls[0] ?? total, dieType: dieSize, total,
      allDice: rolls.map(v => ({ die: dieSize, value: v })),
      expression: dice,
      label,
      logHistory,
    });
  }

  function rollDamage(a: BeastAction) {
    if (!a.damage_dice) return;
    // damage_dice like "1d8+4" — split flat bonus for rollDiceExpr.
    const m = a.damage_dice.replace(/\s/g, '').match(/^(\d+d\d+)([+-]\d+)?$/i);
    if (!m) return;
    const dieSize = parseInt(m[1].split('d')[1], 10);
    const flat = m[2] ? parseInt(m[2], 10) : 0;
    const { rolls, total } = rollDiceExpr(m[1]);
    triggerRoll({
      result: rolls[0] ?? total, dieType: dieSize, modifier: flat, total: total + flat,
      allDice: rolls.map(v => ({ die: dieSize, value: v })),
      expression: a.damage_dice,
      label: `${beast!.name} — ${a.name} (${a.damage_type ?? 'damage'})`,
      logHistory,
    });
  }

  return (
    <div style={{
      padding: '8px 14px', borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 6,
      background: 'rgba(74,222,128,0.04)',
      border: '1px solid rgba(74,222,128,0.3)',
    }}>
      <div
        style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}
        title="2024 Wild Shape: you keep your own HP, INT/WIS/CHA, class features, feats, and languages; use the higher of your save/skill modifiers vs the form's."
      >
        <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 11, color: '#4ade80', letterSpacing: '0.04em' }}>
          BEAST FORM — {beast.name.toUpperCase()}
        </span>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>
          AC {ac}{acNote} · {speeds.join(' · ') || '—'}{pp != null ? ` · PP ${pp}` : ''}
        </span>
      </div>
      {(beast.actions ?? []).map((a, i) => (
        <div key={`${a.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, color: 'var(--t-1)', flexShrink: 0 }}>
            {a.name}
          </span>
          {a.attack_bonus != null ? (
            <>
              <button
                onClick={() => rollHit(a)}
                title={`Roll to hit: d20 ${a.attack_bonus >= 0 ? '+' : ''}${a.attack_bonus}`}
                style={{
                  fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                  padding: '2px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0,
                  background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.4)', color: '#93c5fd',
                }}
              >
                Hit {a.attack_bonus >= 0 ? '+' : ''}{a.attack_bonus}
              </button>
              {a.damage_dice && (
                <button
                  onClick={() => rollDamage(a)}
                  title={`Roll damage: ${a.damage_dice} ${a.damage_type ?? ''}${moonRadiantOption ? ' · Moon L6+: you may deal Radiant instead (Improved Circle Forms)' : ''}`}
                  style={{
                    fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                    padding: '2px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5',
                  }}
                >
                  Dmg {a.damage_dice}{a.damage_type ? ` ${a.damage_type.toLowerCase()}` : ''}
                </button>
              )}
            </>
          ) : (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', flex: 1, minWidth: 140 }}>
              {a.desc ?? ''}
            </span>
          )}
        </div>
      ))}
      {(showPrimal || showLunar) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 2, borderTop: '1px solid rgba(74,222,128,0.15)' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em' }}>
            ON-HIT RIDERS
          </span>
          {showPrimal && (
            <button
              onClick={() => rollRider(primalDice, `Primal Strike (${primalDice} — choose Cold/Fire/Lightning/Thunder)`)}
              title={`Elemental Fury (L7) — only if you chose the Primal Strike option. Once per turn when you hit: +${primalDice} Cold, Fire, Lightning, or Thunder (choose each time).`}
              style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                padding: '2px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0,
                background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.35)', color: '#fdba74',
              }}
            >
              Primal Strike {primalDice}
            </button>
          )}
          {showLunar && (
            <button
              onClick={() => rollRider('2d10', 'Lunar Form (2d10 radiant)')}
              title="Lunar Form (Moon L14) — once per turn, +2d10 Radiant to a target you hit with a Wild Shape form's attack."
              style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                padding: '2px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0,
                background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.4)', color: '#c4b5fd',
              }}
            >
              Lunar Form 2d10
            </button>
          )}
        </div>
      )}
      {(beast.actions ?? []).length === 0 && (
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>
          This form has no listed actions.
        </span>
      )}
    </div>
  );
}
