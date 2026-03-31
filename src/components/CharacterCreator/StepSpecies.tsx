import { useState } from 'react';
import type { SpeciesData } from '../../types';
import { SPECIES } from '../../data/species';
import { FEATS } from '../../data/feats';

// Species that grant an Origin feat at level 1 (2024 PHB)
const ORIGIN_FEAT_SPECIES = ['Human'];

interface StepSpeciesProps {
  selected: string;
  originFeat: string;
  onSelect: (name: string) => void;
  onOriginFeatSelect: (feat: string) => void;
}

const ORIGIN_FEATS = FEATS.filter(f => f.category === 'origin');

export default function StepSpecies({ selected, originFeat, onSelect, onOriginFeatSelect }: StepSpeciesProps) {
  const preview = SPECIES.find(s => s.name === selected);
  const needsOriginFeat = ORIGIN_FEAT_SPECIES.includes(selected);
  const [featSearch, setFeatSearch] = useState('');

  const filteredFeats = ORIGIN_FEATS.filter(f =>
    !featSearch || f.name.toLowerCase().includes(featSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {/* Left: species grid */}
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', fontFamily: 'var(--font-heading)' }}>
            In 2024, species grant traits and size — not ability score bonuses. Those come from your background.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
            {SPECIES.map(s => (
              <SpeciesCard key={s.name} species={s} selected={selected === s.name} onSelect={onSelect} hasOriginFeat={ORIGIN_FEAT_SPECIES.includes(s.name)} />
            ))}
          </div>
        </div>

        {/* Right: preview */}
        <div>
          {preview ? (
            <SpeciesPreview species={preview} />
          ) : (
            <div className="panel" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'var(--font-heading)' }}>
                Select a species to see its traits
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Origin Feat picker — only shown when species grants one */}
      {needsOriginFeat && (
        <div className="card card-gold animate-fade-in">
          <div className="section-header">Choose Your Origin Feat</div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
            As a <strong style={{ color: 'var(--text-gold)' }}>Human</strong>, your Versatile trait grants you one Origin feat at level 1.
            Origin feats represent innate or early-life abilities.
            {!originFeat && <span style={{ color: 'var(--color-crimson-bright)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', marginLeft: 8 }}>
              ← Required to continue
            </span>}
          </p>

          <input
            placeholder="Search feats..."
            value={featSearch}
            onChange={e => setFeatSearch(e.target.value)}
            style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-2)' }}>
            {filteredFeats.map(feat => (
              <button
                key={feat.name}
                onClick={() => onOriginFeatSelect(feat.name)}
                style={{
                  textAlign: 'left',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: originFeat === feat.name ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
                  background: originFeat === feat.name ? 'rgba(201,146,42,0.1)' : 'var(--bg-sunken)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: originFeat === feat.name ? 'var(--text-gold)' : 'var(--text-primary)' }}>
                  {originFeat === feat.name && '✓ '}{feat.name}
                </div>
                {feat.asi && feat.asi[0] && (
                  <div style={{ fontSize: 9, fontFamily: 'var(--font-heading)', color: 'var(--color-gold-bright)', background: 'rgba(201,146,42,0.12)', border: '1px solid rgba(201,146,42,0.3)', borderRadius: 4, padding: '1px 6px', display: 'inline-block', width: 'fit-content' }}>
                    +{feat.asi[0].amount} {feat.asi[0].ability}
                  </div>
                )}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {feat.description.slice(0, 80)}{feat.description.length > 80 ? '…' : ''}
                </div>
              </button>
            ))}
          </div>

          {originFeat && (
            <div style={{
              marginTop: 'var(--space-3)', padding: 'var(--space-3)',
              background: 'rgba(201,146,42,0.08)', border: '1px solid var(--border-gold)',
              borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-sm)', color: 'var(--text-gold)',
            }}>
              ✓ Selected: {originFeat}
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
    <button
      onClick={() => onSelect(species.name)}
      style={{
        fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 'var(--text-sm)',
        padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
        border: selected ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
        background: selected ? 'rgba(201,146,42,0.1)' : 'var(--bg-sunken)',
        color: selected ? 'var(--text-gold)' : 'var(--text-secondary)',
        cursor: 'pointer', transition: 'all var(--transition-fast)', textAlign: 'center',
        position: 'relative',
      }}
    >
      {hasOriginFeat && (
        <div style={{
          position: 'absolute', top: 3, right: 3,
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--color-gold)', opacity: 0.8,
        }} title="Grants an Origin feat" />
      )}
      <div>{species.name}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px' }}>
        {species.size} — {species.speed}ft
      </div>
    </button>
  );
}

function SpeciesPreview({ species }: { species: SpeciesData }) {
  return (
    <div className="card card-gold animate-fade-in">
      <h3 style={{ marginBottom: 'var(--space-1)' }}>{species.name}</h3>
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <span className="badge badge-muted">{species.size}</span>
        <span className="badge badge-muted">{species.speed} ft. speed</span>
        {species.darkvision > 0 && <span className="badge badge-gold">Darkvision {species.darkvision}ft</span>}
        {ORIGIN_FEAT_SPECIES.includes(species.name) && (
          <span className="badge badge-gold">✦ Origin Feat</span>
        )}
      </div>
      <div className="section-header">Traits</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {species.traits.map(trait => (
          <div key={trait.name}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-gold)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-1)' }}>
              {trait.name}
            </div>
            <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>{trait.description}</p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <div className="section-header">Languages</div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{species.languages.join(', ')}</p>
      </div>
    </div>
  );
}
