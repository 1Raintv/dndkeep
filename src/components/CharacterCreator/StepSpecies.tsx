import { useState } from 'react';
import type { SpeciesData } from '../../types';
import { SPECIES } from '../../data/species';
import { FEATS } from '../../data/feats';

const ORIGIN_FEAT_SPECIES = ['Human'];
const ORIGIN_FEATS = FEATS.filter(f => f.category === 'origin');

const SPECIES_LEVEL_FEATURES: Record<string, { level: number; features: string[] }[]> = {
  Human:      [{ level: 1, features: ['Resourceful — Heroic Inspiration on Long Rest', 'Skillful — 1 skill proficiency of choice', 'Versatile — 1 Origin Feat of choice'] }],
  Elf:        [{ level: 1, features: ['Darkvision 60ft', 'Fey Ancestry — adv. vs Charmed', 'Keen Senses — Perception proficiency', 'Trance — 4 hrs = 8 hrs rest', 'Elven Lineage — choose Drow, High Elf, or Wood Elf'] }, { level: 3, features: ['Elven Lineage spell (Faerie Fire / Detect Magic / Speak with Animals)'] }, { level: 5, features: ['Elven Lineage spell (Darkness / Misty Step / Pass without Trace)'] }],
  Dwarf:      [{ level: 1, features: ['Darkvision 60ft', 'Dwarven Resilience — adv. vs Poison, resist Poison damage', 'Dwarven Toughness — +1 HP per level', 'Stonecunning — Tremorsense 60ft on stone (Prof/rest)'] }],
  Halfling:   [{ level: 1, features: ['Brave — adv. vs Frightened', 'Halfling Nimbleness — move through larger creatures', 'Luck — reroll nat 1 on d20', 'Naturally Stealthy — Hide behind larger creatures'] }],
  Gnome:      [{ level: 1, features: ['Darkvision 60ft', 'Gnomish Cunning — adv. on Int/Wis/Cha saves', 'Gnomish Lineage — choose Forest, Rock, or Svirfneblin'] }],
  'Half-Elf': [{ level: 1, features: ['Darkvision 60ft', 'Fey Ancestry — adv. vs Charmed', 'Keen Senses — Perception proficiency', 'Skill Versatility — 2 skill proficiencies of choice'] }],
  Tiefling:   [{ level: 1, features: ['Darkvision 60ft', 'Fiendish Legacy — choose Abyssal, Chthonic, or Infernal', 'Otherworldly Presence — Thaumaturgy cantrip'] }, { level: 3, features: ['Fiendish Legacy spell (Ray of Sickness / False Life / Hellish Rebuke)'] }, { level: 5, features: ['Fiendish Legacy spell (Hold Person / Ray of Enfeeblement / Darkness)'] }],
  Dragonborn: [{ level: 1, features: ['Draconic Ancestry — choose damage type', 'Breath Weapon — uses scale with level', 'Darkvision 60ft', 'Damage Resistance to ancestry type'] }, { level: 5, features: ['Draconic Flight — Fly Speed equal to Speed'] }],
  'Half-Orc': [{ level: 1, features: ['Adrenaline Rush — Dash as Bonus Action (Prof/rest)', 'Darkvision 60ft', 'Relentless Endurance — 1 HP instead of 0 (1/LR)', 'Powerful Build — count as Large for carrying'] }],
  Aasimar:    [{ level: 1, features: ['Celestial Resistance — resist Necrotic & Radiant', 'Darkvision 60ft', 'Healing Hands — restore HP = Prof Bonus (Prof/LR)', 'Light Bearer — Light cantrip'] }, { level: 3, features: ['Celestial Revelation — choose Heavenly Wings, Inner Radiance, or Necrotic Shroud'] }],
  Orc:        [{ level: 1, features: ['Adrenaline Rush — Dash as Bonus Action (Prof/rest)', 'Darkvision 120ft', 'Relentless Endurance — 1 HP instead of 0 (1/LR)', 'Powerful Build — count as Large for carrying'] }],
};

interface StepSpeciesProps {
  selected: string;
  originFeat: string;
  name: string;
  onNameChange: (v: string) => void;
  onSelect: (name: string) => void;
  onOriginFeatSelect: (feat: string) => void;
}

export default function StepSpecies({ selected, originFeat, name, onNameChange, onSelect, onOriginFeatSelect }: StepSpeciesProps) {
  const preview = SPECIES.find(s => s.name === selected);
  const needsOriginFeat = ORIGIN_FEAT_SPECIES.includes(selected);
  const [expandedFeat, setExpandedFeat] = useState<string | null>(null);
  const [featSearch, setFeatSearch] = useState('');
  const levelFeatures = selected ? (SPECIES_LEVEL_FEATURES[selected] ?? []) : [];

  const filteredFeats = ORIGIN_FEATS.filter(f =>
    !featSearch || f.name.toLowerCase().includes(featSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Name input — first thing */}
      <div>
        <label style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--t-2)', marginBottom: 6, display: 'block' }}>Character Name</label>
        <input
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="What do they call you?"
          autoFocus
          style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, padding: '10px 14px' }}
        />
        {!name.trim() && (
          <div style={{ marginTop: 4, fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>Required to create your character</div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--c-border)' }} />

      <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', margin: 0 }}>
        In 2024, species grant traits and size — not ability score bonuses. Those come from your background.
      </p>

      {/* Species grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-2)' }}>
        {SPECIES.map(s => (
          <SpeciesCard key={s.name} species={s} selected={selected === s.name} onSelect={onSelect}
            hasOriginFeat={ORIGIN_FEAT_SPECIES.includes(s.name)} />
        ))}
      </div>

      {/* Traits by level — shown at bottom when selected */}
      {preview && levelFeatures.length > 0 && (
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4) var(--sp-5)' }} className="animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--t-1)' }}>{preview.name}</span>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', background: 'var(--c-raised)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--c-border-m)' }}>{preview.size}</span>
            {preview.darkvision > 0 && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--c-gold-bdr)' }}>Darkvision {preview.darkvision}ft</span>}
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-blue-l)', background: 'var(--c-blue-bg)', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(59,130,246,0.3)' }}>
              🗣 {preview.languages.join(', ')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {levelFeatures.map(({ level, features }) => (
              <div key={level} style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 999, marginTop: 2,
                  color: level === 1 ? 'var(--c-gold-l)' : 'var(--c-purple-l)',
                  background: level === 1 ? 'var(--c-gold-bg)' : 'var(--c-purple-bg)',
                  border: `1px solid ${level === 1 ? 'var(--c-gold-bdr)' : 'rgba(124,58,237,0.3)'}` }}>
                  Lv {level}
                </span>
                <div style={{ flex: 1, fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6 }}>
                  {features.join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Origin Feat picker — expandable rows */}
      {needsOriginFeat && (
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4) var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)' }}>Origin Feat</span>
              {!originFeat && <span style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)', fontWeight: 500 }}>— required to continue</span>}
              {originFeat && <span style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--c-green-l)', fontWeight: 600 }}>✓ {originFeat}</span>}
            </div>
          </div>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', margin: 0 }}>
            Your Versatile trait grants one Origin feat at level 1. Click any feat to see details and select it.
          </p>
          <input placeholder="Search feats…" value={featSearch} onChange={e => setFeatSearch(e.target.value)} style={{ fontSize: 'var(--fs-sm)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredFeats.map(feat => {
              const isSelected = originFeat === feat.name;
              const isExpanded = expandedFeat === feat.name;
              return (
                <div key={feat.name} style={{ borderRadius: 'var(--r-md)', border: isSelected ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)', background: isSelected ? 'var(--c-gold-bg)' : 'var(--c-raised)', overflow: 'hidden' }}>
                  {/* Row header — always visible */}
                  <button
                    onClick={() => setExpandedFeat(isExpanded ? null : feat.name)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 0 }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', transition: 'transform 150ms', transform: isExpanded ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>▶</span>
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--c-gold-l)' : 'var(--t-1)', flex: 1 }}>
                      {isSelected ? '✓ ' : ''}{feat.name}
                    </span>
                    {feat.asi?.[0] && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>
                        +{feat.asi[0].amount} {feat.asi[0].ability}
                      </span>
                    )}
                  </button>
                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: 'var(--sp-2) var(--sp-3) var(--sp-3) calc(var(--sp-3) + 20px)', borderTop: '1px solid var(--c-border)' }}>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6, margin: '0 0 var(--sp-2)' }}>{feat.description}</p>
                      <button
                        className={isSelected ? 'btn-secondary btn-sm' : 'btn-gold btn-sm'}
                        onClick={() => { onOriginFeatSelect(isSelected ? '' : feat.name); setExpandedFeat(null); }}>
                        {isSelected ? 'Deselect' : 'Select this feat'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SpeciesCard({ species, selected, onSelect, hasOriginFeat }: {
  species: SpeciesData; selected: boolean; onSelect: (n: string) => void; hasOriginFeat: boolean;
}) {
  return (
    <button onClick={() => onSelect(species.name)} style={{
      padding: 'var(--sp-3)', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'center',
      border: selected ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
      background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
      color: selected ? 'var(--c-gold-l)' : 'var(--t-2)',
      transition: 'all var(--tr-fast)', position: 'relative', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center',
    }}>
      {hasOriginFeat && <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: 'var(--c-gold)' }} title="Grants an Origin feat" />}
      <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{species.name}</span>
      <span style={{ fontSize: 'var(--fs-xs)', color: selected ? 'var(--c-gold)' : 'var(--t-3)' }}>{species.size}</span>
    </button>
  );
}
