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
//   - Uses: 2 (L2), 3 (L6), 4 (L17). (Partial short-rest recharge —
//     regain ONE use — is the separate roadmap item; rest handling
//     is unchanged here.)
//
// Storage: no migration. Remaining uses live in
// class_resources['wild-shape'] (existing resource id); the active
// form is an ActiveBuff in active_buffs (id prefix 'wild-shape'),
// which the sheet's existing buff chips already render.
//
// On revert we clear temp_hp (the temp HP rule in Wild Shape sits
// under "While in a form ... the following rules apply", so the
// form's temp HP end with the form). Flagged for Jared verification.

import { useState } from 'react';
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

export default function WildShapePanel({ character, onUpdate, onBonusUsed }: WildShapePanelProps) {
  const [formName, setFormName] = useState('');

  if (character.class_name !== 'Druid' || character.level < 2) return null;

  const isMoon = (character.subclass ?? '').toLowerCase().includes('moon') && character.level >= 3;
  const maxUses = getWildShapeMax(character.level);
  const resources = (character.class_resources as Record<string, number> | null) ?? {};
  const remaining = resources['wild-shape'] ?? maxUses;
  const buffs: ActiveBuff[] = ((character as any).active_buffs as ActiveBuff[] | null) ?? [];
  const activeForm = buffs.find(b => b.id?.startsWith(BUFF_PREFIX)) ?? null;
  const tempGrant = character.level * (isMoon ? 3 : 1);
  const hours = Math.floor(character.level / 2);

  function assumeForm() {
    const name = formName.trim() || 'Beast form';
    if (remaining <= 0) return;
    const buff: ActiveBuff = {
      id: `${BUFF_PREFIX}-${Date.now()}`,
      name: `Wild Shape: ${name}`,
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
    } as Partial<Character>, true);
    onBonusUsed();
    setFormName('');
  }

  function revert() {
    onUpdate({
      active_buffs: buffs.filter(b => !b.id?.startsWith(BUFF_PREFIX)),
      temp_hp: 0,
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

  return (
    <div style={{
      padding: '8px 14px', borderRadius: 10,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: activeForm ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.03)',
      border: `1px solid ${activeForm ? 'rgba(74,222,128,0.45)' : 'rgba(74,222,128,0.25)'}`,
    }}>
      {chip('1BA', '#8b5cf6')}
      {activeForm ? (
        <>
          <div style={{ flex: 1, minWidth: 160 }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: '#4ade80' }}>
              {activeForm.name}
            </span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', marginLeft: 8 }}>
              up to {hours} h · Temp HP {tempGrant} on assuming · uses {remaining}/{maxUses}
            </span>
          </div>
          {remaining > 0 && (
            <button
              onClick={assumeForm}
              title="Use Wild Shape again while shaped: fresh Temp HP, same or new form (spends a use)"
              style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
                padding: '4px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer', minHeight: 0,
                background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.4)', color: '#4ade80',
              }}
            >
              Re-shape
            </button>
          )}
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
        </>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: 'var(--t-1)' }}>
              Wild Shape
            </span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>
              {remaining}/{maxUses} uses · +{tempGrant} Temp HP · up to {hours} h
            </span>
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && remaining > 0) assumeForm(); }}
              placeholder="Form (e.g. Wolf)"
              maxLength={40}
              style={{
                fontFamily: 'var(--ff-body)', fontSize: 11, padding: '3px 8px',
                width: 130, minHeight: 0,
              }}
            />
          </div>
          <button
            onClick={assumeForm}
            disabled={remaining <= 0}
            title={remaining <= 0 ? 'No Wild Shape uses left (regain on rest)' : 'Assume a Wild Shape form (Bonus Action)'}
            style={{
              fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
              padding: '4px 12px', borderRadius: 'var(--r-md)', minHeight: 0,
              cursor: remaining <= 0 ? 'default' : 'pointer',
              background: remaining <= 0 ? 'rgba(148,163,184,0.08)' : 'rgba(74,222,128,0.12)',
              border: `1px solid ${remaining <= 0 ? 'rgba(148,163,184,0.3)' : 'rgba(74,222,128,0.5)'}`,
              color: remaining <= 0 ? 'var(--t-3)' : '#4ade80',
            }}
          >
            Assume Form
          </button>
        </>
      )}
    </div>
  );
}
