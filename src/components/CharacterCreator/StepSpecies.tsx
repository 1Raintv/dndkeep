import { useState } from 'react';
import type { SpeciesData } from '../../types';
import { SPECIES } from '../../data/species';
import { FEATS } from '../../data/feats';

const ORIGIN_FEAT_SPECIES = ['Human'];
const ORIGIN_FEATS = FEATS.filter(f => f.category === 'origin');

// Level-gated features extracted per species
const SPECIES_LEVEL_FEATURES: Record<string, { level: number; features: string[] }[]> = {
  Human: [
    { level: 1, features: ['Resourceful — Heroic Inspiration on Long Rest', 'Skillful — 1 skill proficiency', 'Versatile — 1 Origin Feat of your choice'] },
  ],
  Elf: [
    { level: 1, features: ['Darkvision 60ft', 'Fey Ancestry — advantage vs. Charmed', 'Keen Senses — Perception proficiency', 'Trance — only 4 hours of meditation needed', 'Elven Lineage — choose Drow, High Elf, or Wood Elf'] },
    { level: 3, features: ['Elven Lineage spell (Faerie Fire / Detect Magic / Speak with Animals)'] },
    { level: 5, features: ['Elven Lineage spell (Darkness / Misty Step / Pass without Trace)'] },
  ],
  Dwarf: [
    { level: 1, features: ['Darkvision 60ft', 'Dwarven Resilience — advantage vs. Poison, resist Poison damage', 'Dwarven Toughness — +1 HP per level', 'Stonecunning — Tremorsense 60ft on stone (Prof. Bonus uses/rest)'] },
  ],
  Halfling: [
    { level: 1, features: ['Brave — advantage vs. Frightened', 'Halfling Nimbleness — move through larger creatures', 'Luck — reroll a d20 nat 1', 'Naturally Stealthy — Hide behind larger creatures'] },
  ],
  Gnome: [
    { level: 1, features: ['Darkvision 60ft', 'Gnomish Cunning — advantage on Int/Wis/Cha saves', 'Gnomish Lineage — choose Forest, Rock, or Svirfneblin'] },
  ],
  'Half-Elf': [
    { level: 1, features: ['Darkvision 60ft', 'Fey Ancestry — advantage vs. Charmed', 'Keen Senses — Perception proficiency', 'Skill Versatility — 2 skill proficiencies of your choice'] },
  ],
  Tiefling: [
    { level: 1, features: ['Darkvision 60ft', 'Fiendish Legacy — choose Abyssal, Chthonic, or Infernal', 'Otherworldly Presence — Thaumaturgy cantrip'] },
    { level: 3, features: ['Fiendish Legacy spell (Ray of Sickness / False Life / Hellish Rebuke)'] },
    { level: 5, features: ['Fiendish Legacy spell (Hold Person / Ray of Enfeeblement / Darkness)'] },
  ],
  Dragonborn: [
    { level: 1, features: ['Draconic Ancestry — choose damage type', 'Breath Weapon — Dex/Con save, 1d10 per 3 levels', 'Darkvision 60ft (Chromatic / Gem)', 'Damage Resistance to ancestry type', 'Psionic Mind (Gem) or Astral Walk (Metallic)'] },
    { level: 5, features: ['Draconic Flight (Metallic) or Gem Flight (Gem) — Fly Speed equal to your Speed'] },
  ],
  'Half-Orc': [
    { level: 1, features: ['Adrenaline Rush — Dash as Bonus Action (Prof. Bonus uses/rest)', 'Darkvision 60ft', 'Relentless Endurance — drop to 1 HP instead of 0 (1/Long Rest)', 'Powerful Build — count as Large for carrying'] },
  ],
  Aasimar: [
    { level: 1, features: ['Celestial Resistance — resist Necrotic and Radiant damage', 'Darkvision 60ft', 'Healing Hands — restore HP equal to Prof. Bonus (Prof. Bonus uses/Long Rest)', 'Light Bearer — Light cantrip'] },
    { level: 3, features: ['Celestial Revelation — choose Heavenly Wings (Fly 10ft), Inner Radiance (+Radiant damage), or Necrotic Shroud (+Necrotic damage)'] },
  ],
  Orc: [
    { level: 1, features: ['Adrenaline Rush — Dash as Bonus Action (Prof. Bonus uses/rest)', 'Darkvision 120ft', 'Relentless Endurance — drop to 1 HP instead of 0 (1/Long Rest)', 'Powerful Build — count as Large for carrying'] },
  ],
};

interface StepSpeciesProps {
  selected: string;
  originFeat: string;
  onSelect: (name: string) => void;
  onOriginFeatSelect: (feat: string) => void;
}

export default function StepSpecies({ selected, originFeat, onSelect, onOriginFeatSelect }: StepSpeciesProps) {
  const preview = SPECIES.find(s => s.name === selected);
  const needsOriginFeat = ORIGIN_FEAT_SPECIES.includes(selected);
  const [featSearch, setFeatSearch] = useState('');
  const levelFeatures = selected ? (SPECIES_LEVEL_FEATURES[selected] ?? []) : [];
  const filteredFeats = ORIGIN_FEATS.filter(f =>
    !featSearch || f.name.toLowerCase().includes(featSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', margin: 0 }}>
        In 2024, species grant traits and size — not ability score bonuses. Those come from your background.
      </p>

      {/* Species grid — 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)' }}>
        {SPECIES.map(s => (
          <SpeciesCard key={s.name} species={s} selected={selected === s.name} onSelect={onSelect}
            hasOriginFeat={ORIGIN_FEAT_SPECIES.includes(s.name)} />
        ))}
      </div>

      {/* Info panel — shows only when selected, at bottom */}
      {preview && (
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }} className="animate-fade-in">
          <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--t-1)' }}>{preview.name}</span>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', background: 'var(--c-raised)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--c-border-m)' }}>{preview.size}</span>
            {preview.darkvision > 0 && (
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--c-gold-bdr)' }}>
                Darkvision {preview.darkvision}ft
              </span>
            )}
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-blue-l)', background: 'var(--c-blue-bg)', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(59,130,246,0.3)' }}>
              🗣 {preview.languages.join(', ')}
            </span>
          </div>

          {/* Features by level */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {levelFeatures.map(({ level, features }) => (
              <div key={level} style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, minWidth: 56 }}>
                  <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: level === 1 ? 'var(--c-gold-l)' : 'var(--c-purple-l)', background: level === 1 ? 'var(--c-gold-bg)' : 'var(--c-purple-bg)', border: `1px solid ${level === 1 ? 'var(--c-gold-bdr)' : 'rgba(124,58,237,0.3)'}`, padding: '2px 8px', borderRadius: 999 }}>
                    Lv {level}
                  </span>
                </div>
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
                  {features.map((f, i) => (
                    <span key={i} style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.5 }}>
                      {i > 0 && <span style={{ color: 'var(--t-3)', margin: '0 4px' }}>·</span>}
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Origin Feat picker for Human */}
      {needsOriginFeat && (
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)', marginBottom: 4 }}>
              Choose Your Origin Feat
              {!originFeat && <span style={{ color: 'var(--c-red-l)', fontSize: 'var(--fs-xs)', fontWeight: 500, marginLeft: 8 }}>— required to continue</span>}
            </div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', margin: 0 }}>
              As a Human, your Versatile trait grants you one Origin feat at level 1.
            </p>
          </div>
          <input placeholder="Search feats…" value={featSearch} onChange={e => setFeatSearch(e.target.value)} style={{ fontSize: 'var(--fs-sm)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-2)' }}>
            {filteredFeats.map(feat => (
              <button key={feat.name} onClick={() => onOriginFeatSelect(feat.name)}
                style={{ textAlign: 'left', padding: 'var(--sp-3)', borderRadius: 'var(--r-md)', border: originFeat === feat.name ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)', background: originFeat === feat.name ? 'var(--c-gold-bg)' : 'var(--c-raised)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: originFeat === feat.name ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{originFeat === feat.name ? '✓ ' : ''}{feat.name}</span>
                {feat.asi?.[0] && <span style={{ fontSize: 9, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', padding: '1px 5px', borderRadius: 4, display: 'inline-block', width: 'fit-content' }}>+{feat.asi[0].amount} {feat.asi[0].ability}</span>}
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{feat.description}</span>
              </button>
            ))}
          </div>
          {originFeat && (
            <div style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)', fontWeight: 600 }}>
              ✓ {originFeat}
            </div>
          )}
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
      transition: 'all var(--tr-fast)', position: 'relative',
      display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center',
    }}>
      {hasOriginFeat && <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: 'var(--c-gold)' }} title="Grants an Origin feat" />}
      <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{species.name}</span>
      <span style={{ fontSize: 'var(--fs-xs)', color: selected ? 'var(--c-gold)' : 'var(--t-3)' }}>{species.size}</span>
    </button>
  );
}
