import type { SpeciesData } from '../../types';
import { SPECIES } from '../../data/species';

interface StepSpeciesProps {
  selected: string;
  onSelect: (name: string) => void;
}

export default function StepSpecies({ selected, onSelect }: StepSpeciesProps) {
  const preview = SPECIES.find(s => s.name === selected);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      {/* Grid of species cards */}
      <div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', fontFamily: 'var(--font-heading)' }}>
          In 2024, species grant traits and size — not ability score bonuses. Those come from your background.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
          {SPECIES.map(s => (
            <SpeciesCard key={s.name} species={s} selected={selected === s.name} onSelect={onSelect} />
          ))}
        </div>
      </div>

      {/* Preview panel */}
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
  );
}

function SpeciesCard({ species, selected, onSelect }: { species: SpeciesData; selected: boolean; onSelect: (n: string) => void }) {
  return (
    <button
      onClick={() => onSelect(species.name)}
      style={{
        fontFamily: 'var(--font-heading)',
        fontWeight: 600,
        fontSize: 'var(--text-sm)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: selected ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
        background: selected ? 'rgba(201,146,42,0.1)' : 'var(--bg-sunken)',
        color: selected ? 'var(--text-gold)' : 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        textAlign: 'center',
      }}
    >
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
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <span className="badge badge-muted">{species.size}</span>
        <span className="badge badge-muted">{species.speed} ft. speed</span>
        {species.darkvision > 0 && <span className="badge badge-gold">Darkvision {species.darkvision}ft</span>}
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
