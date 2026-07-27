// v2.629.0 — Weapon Mastery picker (2024 PHB / SRD 5.2.1).
//
// Renders only for classes with the Weapon Mastery feature
// (masterySlots > 0). Choosing into an OPEN slot is free (initial
// picks, level-up growth); removing a chosen weapon starts the one
// swap allowed per Long Rest (SRD: "you can change one of those
// weapon choices" on a Long Rest) and locks further removals until a
// Long Rest — same feature_uses pattern as the Wild Shape swap
// (v2.624). Both long-rest paths wipe feature_uses, so the reset is
// free. Automation of the mastery riders in the attack pipeline is
// Ship B (v2.630+); this panel is selection + reference only.
import { useState } from 'react';
import type { Character } from '../../types';
import {
  MASTERY_PROPERTIES,
  eligibleMasteryWeapons,
  masterySlots,
} from '../../data/weaponMastery';

interface Props {
  character: Character;
  onUpdate: (updates: Partial<Character>, persist?: boolean) => void;
}

export default function WeaponMasteryPanel({ character, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const slots = masterySlots(character.class_name, character.level);
  if (slots <= 0) return null;

  const chosen: string[] = ((character as any).weapon_masteries as string[] | null) ?? [];
  const eligible = eligibleMasteryWeapons(character.class_name);
  const featureUses = (character.feature_uses as Record<string, number> | null) ?? {};
  const swapUsed = (featureUses['Weapon Mastery Swap'] ?? 0) >= 1;
  const canLearn = chosen.length < slots;

  function learn(name: string) {
    if (!canLearn || chosen.includes(name)) return;
    onUpdate({ weapon_masteries: [...chosen, name] } as Partial<Character>, true);
  }

  function unlearn(name: string) {
    if (swapUsed) return;
    onUpdate({
      weapon_masteries: chosen.filter(w => w !== name),
      feature_uses: { ...featureUses, 'Weapon Mastery Swap': 1 },
    } as Partial<Character>, true);
  }

  return (
    <div style={{
      border: '1px solid var(--c-border)', borderRadius: 6,
      background: 'rgba(255,255,255,0.02)', padding: 10, marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--ff-display)', fontSize: 12, fontWeight: 800, color: 'var(--t-1)', letterSpacing: '0.04em' }}>
          Weapon Mastery
        </span>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', fontWeight: 700 }}>
          {chosen.length}/{slots}
        </span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            marginLeft: 'auto', padding: '3px 8px', borderRadius: 4,
            border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.04)',
            color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 9,
            fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
          title={`Choose which weapons you have mastery in (${chosen.length}/${slots}). RAW: change one choice per Long Rest.`}
        >
          {open ? 'Done' : 'Manage'}
        </button>
      </div>

      {/* Chosen chips (always visible) */}
      {chosen.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {chosen.map(name => {
            const w = eligible.find(e => e.name === name);
            const mastery = w?.mastery ?? null;
            return (
              <span
                key={name}
                title={mastery ? `${mastery}: ${MASTERY_PROPERTIES[mastery]}` : name}
                style={{
                  padding: '3px 8px', borderRadius: 4, fontFamily: 'var(--ff-body)',
                  fontSize: 10, fontWeight: 700,
                  border: '1px solid rgba(96,165,250,0.45)',
                  background: 'rgba(96,165,250,0.12)', color: '#93c5fd',
                }}
              >
                {name}{mastery ? ` · ${mastery}` : ''}
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, marginBottom: 6, color: swapUsed ? '#fbbf24' : 'var(--t-3)' }}>
            {swapUsed
              ? 'Weapon swap used — next change after a Long Rest. Open slots can still be filled.'
              : 'RAW: change one chosen weapon per Long Rest. Filling open slots is free.'}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {eligible.map(w => {
              const has = chosen.includes(w.name);
              const clickable = has ? !swapUsed : canLearn;
              return (
                <button
                  key={w.name}
                  onClick={() => (has ? unlearn(w.name) : learn(w.name))}
                  disabled={!clickable}
                  title={has
                    ? (swapUsed ? 'Swap already used — resets on Long Rest' : `Remove ${w.name} (starts your one swap per Long Rest)`)
                    : canLearn
                      ? `${w.mastery}: ${MASTERY_PROPERTIES[w.mastery]}`
                      : `All ${slots} choices used`}
                  style={{
                    padding: '3px 8px', borderRadius: 4,
                    border: `1px solid ${has ? 'rgba(96,165,250,0.55)' : 'var(--c-border)'}`,
                    background: has ? 'rgba(96,165,250,0.14)' : 'rgba(255,255,255,0.03)',
                    fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 600,
                    color: has ? (swapUsed ? 'var(--t-3)' : '#93c5fd') : clickable ? 'var(--t-2)' : 'var(--t-3)',
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                >
                  {w.name} <span style={{ opacity: 0.7 }}>· {w.mastery}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
