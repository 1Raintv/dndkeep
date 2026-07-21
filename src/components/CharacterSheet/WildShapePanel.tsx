// v2.598.0 — Wild Shape tracker (SPELL_AUTOMATION_AUDIT, class
// features ship). 2024 rules implemented exactly:
//
//   - Bonus Action to assume a form; leave early as a Bonus Action.
//   - Temporary Hit Points = Druid level on assuming a form
//     (Circle of the Moon L3+: 3 x Druid level, per Circle Forms).
//     Temp HP never stack — we keep the HIGHER of current temp and
//     the grant, per the general temp HP rule.
//   - Duration: half Druid level in hours; ends early on reuse,
//     Incapacitated, death, or voluntary revert (BA).
//   - Uses: 2 (L2), 3 (L6), 4 (L17); partial short-rest recharge
//     (regain ONE use) shipped v2.606.
//
// Storage: remaining uses live in class_resources['wild-shape']; the
// active form is an ActiveBuff in active_buffs (id prefix
// 'wild-shape'), which the sheet's existing buff chips already render.
//
// On revert we clear temp_hp (the temp HP rule in Wild Shape sits
// under "While in a form ... the following rules apply", so the
// form's temp HP end with the form). v2.610.0 — verified with Jared
// after research: RAW is arguable both ways, but the intent reading
// (community consensus incl. RPGBOT) is that the THP end when Wild
// Shape ends. Deliberate ruling, surfaced in the UI below.
//
// v2.612.0 — Phase A1 of the playable-forms arc
// (docs/PLAYABLE_FORMS_AND_MINIONS.md): free-text form name replaced
// with a Known Forms picker backed by the `monsters` catalogue.
// 2024 RAW gates enforced, and — per Jared's product rule — the
// picker ONLY LISTS forms the character can legally use right now:
//   - CR cap: Moon L3+ = floor(level/3) (min 1); others ¼ at L2,
//     ½ at L4, 1 at L8.
//   - Fly-speed forms hidden entirely until L8.
//   - Known forms: 4 at L2, 6 at L4, 8 at L8 (RAW swap cadence of
//     one per Long Rest is a table courtesy for now — management is
//     free-form but always eligibility-filtered).
// The assumed form's monster id persists in wildshape_beast_name so
// Phase A2 can render the beast's rollable actions while shaped.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Character, ActiveBuff } from '../../types';

interface WildShapePanelProps {
  character: Character;
  onUpdate: (patch: Partial<Character>, immediate?: boolean) => void;
  onBonusUsed: () => void;
}

const BUFF_PREFIX = 'wild-shape';

export function getWildShapeMax(level: number): number {
  if (level >= 17) return 4;
  if (level >= 6) return 3;
  return 2;
}

export function getKnownFormsMax(level: number): number {
  if (level >= 8) return 8;
  if (level >= 4) return 6;
  return 4;
}

/** Parse a CR string ('0', '1/8', '1/4', '1/2', '3') to a number. */
function crValue(cr: string | null | undefined): number {
  if (!cr) return 0;
  const s = cr.trim();
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** 2024 RAW max eligible CR. Moon (L3+): floor(level/3), min 1. */
export function getMaxFormCr(level: number, isMoon: boolean): number {
  if (isMoon) return Math.max(1, Math.floor(level / 3));
  if (level >= 8) return 1;
  if (level >= 4) return 0.5;
  return 0.25;
}

interface BeastRow {
  id: string;
  name: string;
  cr: string | null;
  size: string | null;
  fly_speed: number | null;
}

export default function WildShapePanel({ character, onUpdate, onBonusUsed }: WildShapePanelProps) {
  const [manageOpen, setManageOpen] = useState(false);
  const [beasts, setBeasts] = useState<BeastRow[] | null>(null);

  const isDruid = character.class_name === 'Druid' && character.level >= 2;

  // Fetch the eligible-beast catalogue once. RLS: catalogue rows have
  // owner_id NULL → readable by all authenticated users.
  useEffect(() => {
    if (!isDruid) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('monsters')
        .select('id, name, cr, size, fly_speed')
        .eq('type', 'Beast')
        .is('owner_id', null);
      if (!cancelled) setBeasts((data as BeastRow[] | null) ?? []);
    })();
    return () => { cancelled = true; };
  }, [isDruid]);

  if (!isDruid) return null;

  const isMoon = (character.subclass ?? '').toLowerCase().includes('moon') && character.level >= 3;
  const maxUses = getWildShapeMax(character.level);
  const resources = (character.class_resources as Record<string, number> | null) ?? {};
  const remaining = resources['wild-shape'] ?? maxUses;
  const buffs: ActiveBuff[] = ((character as any).active_buffs as ActiveBuff[] | null) ?? [];
  const activeForm = buffs.find(b => b.id?.startsWith(BUFF_PREFIX)) ?? null;
  const tempGrant = character.level * (isMoon ? 3 : 1);
  const hours = Math.floor(character.level / 2);
  const knownMax = getKnownFormsMax(character.level);
  const crCap = getMaxFormCr(character.level, isMoon);
  const canFly = character.level >= 8;

  // Per Jared's rule: eligibility-filter EVERYTHING. Nothing above the
  // current cap (CR, fly, level) is ever rendered — not even greyed.
  const eligible = (beasts ?? [])
    .filter(b => crValue(b.cr) <= crCap && (canFly || !((b.fly_speed ?? 0) > 0)))
    .sort((a, b) => crValue(a.cr) - crValue(b.cr) || a.name.localeCompare(b.name));
  const eligibleById = new Map(eligible.map(b => [b.id, b]));

  const knownIds = ((character as any).wildshape_known_forms as string[] | null) ?? [];
  // Only still-eligible known forms are shown/assumable.
  const knownForms = knownIds.map(id => eligibleById.get(id)).filter((b): b is BeastRow => !!b);

  function setKnown(next: string[]) {
    onUpdate({ wildshape_known_forms: next } as Partial<Character>, true);
  }

  function assumeForm(form: BeastRow) {
    if (remaining <= 0) return;
    const buff: ActiveBuff = {
      id: `${BUFF_PREFIX}-${Date.now()}`,
      name: `Wild Shape: ${form.name}`,
      duration: -1,
      color: '#4ade80',
      effects: [
        `Beast form for up to ${hours} h`,
        `Temp HP granted: ${tempGrant}`,
        'Revert: Bonus Action (or on Incapacitated)',
      ],
    };
    onUpdate({
      class_resources: { ...resources, 'wild-shape': remaining - 1 },
      temp_hp: Math.max(character.temp_hp ?? 0, tempGrant),
      active_buffs: [...buffs.filter(b => !b.id?.startsWith(BUFF_PREFIX)), buff],
      wildshape_beast_name: form.id,
    } as Partial<Character>, true);
    onBonusUsed();
  }

  function revert() {
    onUpdate({
      active_buffs: buffs.filter(b => !b.id?.startsWith(BUFF_PREFIX)),
      temp_hp: 0,
      wildshape_beast_name: null,
    } as Partial<Character>, true);
    onBonusUsed();
  }

  const chip = (text: string, color: string) => (
    <span style={{
      fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 9, color,
      border: `1px solid ${color}66`, borderRadius: 4, padding: '2px 6px',
      letterSpacing: '0.08em', flexShrink: 0,
    }}>{text}</span>
  );

  const formChip = (form: BeastRow) => {
    const isCurrent = activeForm != null && character.wildshape_beast_name === form.id;
    const clickable = remaining > 0 && !isCurrent;
    return (
      <button
        key={form.id}
        onClick={() => clickable && assumeForm(form)}
        disabled={!clickable}
        title={isCurrent
          ? 'Current form'
          : remaining <= 0
            ? 'No Wild Shape uses left (regain on rest)'
            : activeForm
              ? `Re-shape into ${form.name} (Bonus Action, spends a use, fresh Temp HP)`
              : `Assume ${form.name} (Bonus Action, spends a use)`}
        style={{
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
          padding: '3px 8px', borderRadius: 6, minHeight: 0,
          cursor: clickable ? 'pointer' : 'default',
          background: isCurrent ? 'rgba(74,222,128,0.18)' : 'rgba(74,222,128,0.06)',
          border: `1px solid ${isCurrent ? 'rgba(74,222,128,0.6)' : 'rgba(74,222,128,0.3)'}`,
          color: isCurrent ? '#4ade80' : clickable ? 'var(--t-1)' : 'var(--t-3)',
        }}
      >
        {form.name} <span style={{ fontWeight: 500, color: 'var(--t-3)' }}>CR {form.cr}</span>
      </button>
    );
  };

  return (
    <div style={{
      padding: '8px 14px', borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
      background: activeForm ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.03)',
      border: `1px solid ${activeForm ? 'rgba(74,222,128,0.45)' : 'rgba(74,222,128,0.25)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {chip('1BA', '#8b5cf6')}
        <div style={{ flex: 1, minWidth: 160 }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: activeForm ? '#4ade80' : 'var(--t-1)' }}>
            {activeForm ? activeForm.name : 'Wild Shape'}
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', marginLeft: 8 }}>
            {activeForm
              ? `up to ${hours} h · Temp HP ${tempGrant} on assuming (end on revert — 2024 intent; RAW ambiguous) · uses ${remaining}/${maxUses}`
              : `${remaining}/${maxUses} uses · +${tempGrant} Temp HP · up to ${hours} h · max CR ${crCap < 1 ? (crCap === 0.5 ? '1/2' : '1/4') : crCap}`}
          </span>
        </div>
        <button
          onClick={() => setManageOpen(o => !o)}
          title={`Choose which Beast forms you know (${knownForms.length}/${knownMax}). RAW: swap one per Long Rest.`}
          style={{
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
            padding: '4px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer', minHeight: 0,
            background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.35)', color: 'var(--t-2)',
          }}
        >
          {manageOpen ? 'Done' : `Forms ${knownForms.length}/${knownMax}`}
        </button>
        {activeForm && (
          <button
            onClick={revert}
            title="Leave the form (Bonus Action). Remaining Wild Shape temp HP end with the form."
            style={{
              fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
              padding: '4px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer', minHeight: 0,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5',
            }}
          >
            Revert
          </button>
        )}
      </div>

      {/* Known-form chips: assume (or re-shape) with one click. */}
      {knownForms.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {knownForms.map(formChip)}
        </div>
      )}
      {knownForms.length === 0 && beasts !== null && !manageOpen && (
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>
          No known forms yet — use "Forms" to learn up to {knownMax} eligible Beast forms.
        </span>
      )}

      {/* Manage: ONLY currently-eligible beasts are ever listed. */}
      {manageOpen && (
        <div style={{
          maxHeight: 220, overflowY: 'auto', borderRadius: 8,
          border: '1px solid rgba(148,163,184,0.25)', padding: '6px 8px',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          {beasts === null && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>Loading forms…</span>
          )}
          {beasts !== null && eligible.length === 0 && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>No eligible forms found.</span>
          )}
          {eligible.map(b => {
            const known = knownIds.includes(b.id);
            const canLearn = !known && knownForms.length < knownMax;
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-1)', flex: 1 }}>
                  {b.name}
                </span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', flexShrink: 0 }}>
                  CR {b.cr} · {b.size}{(b.fly_speed ?? 0) > 0 ? ' · Fly' : ''}
                </span>
                <button
                  onClick={() => setKnown(known ? knownIds.filter(id => id !== b.id) : [...knownIds, b.id])}
                  disabled={!known && !canLearn}
                  title={known ? 'Forget this form' : canLearn ? 'Learn this form' : `Known forms full (${knownMax})`}
                  style={{
                    fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                    padding: '2px 8px', borderRadius: 6, minHeight: 0,
                    cursor: known || canLearn ? 'pointer' : 'default',
                    background: known ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
                    border: `1px solid ${known ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)'}`,
                    color: known ? '#fca5a5' : canLearn ? '#4ade80' : 'var(--t-3)',
                  }}
                >
                  {known ? 'Forget' : 'Learn'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
