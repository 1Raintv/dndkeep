import type { BackgroundData } from '../../types';
import { BACKGROUNDS } from '../../data/backgrounds';
import { capitalize } from '../../lib/gameUtils';

interface StepBackgroundProps {
  selected: string;
  onSelect: (name: string) => void;
}

export default function StepBackground({ selected, onSelect }: StepBackgroundProps) {
  const preview = BACKGROUNDS.find(b => b.name === selected);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)', fontFamily: 'var(--font-heading)' }}>
          In 2024, backgrounds grant your ability score improvements: +2 to one ability, +1 to another.
        </p>
        {BACKGROUNDS.map(bg => (
          <BackgroundRow key={bg.name} bg={bg} selected={selected === bg.name} onSelect={onSelect} />
        ))}
      </div>
      <div>
        {preview ? (
          <BackgroundPreview bg={preview} />
        ) : (
          <div className="panel" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'var(--font-heading)' }}>Select a background</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BackgroundRow({ bg, selected, onSelect }: { bg: BackgroundData; selected: boolean; onSelect: (n: string) => void }) {
  const primaryLabel = bg.asi_primary.slice(0, 3).toUpperCase();
  const secondaryLabel = bg.asi_secondary.slice(0, 3).toUpperCase();
  return (
    <button
      onClick={() => onSelect(bg.name)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: selected ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
        background: selected ? 'rgba(201,146,42,0.1)' : 'var(--bg-sunken)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        textAlign: 'left',
      }}
    >
      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 'var(--text-sm)', color: selected ? 'var(--text-gold)' : 'var(--text-secondary)' }}>
        {bg.name}
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
        <span className="badge badge-gold">+2 {primaryLabel}</span>
        <span className="badge badge-muted">+1 {secondaryLabel}</span>
      </div>
    </button>
  );
}

function BackgroundPreview({ bg }: { bg: BackgroundData }) {
  return (
    <div className="card card-gold animate-fade-in">
      <h3 style={{ marginBottom: 'var(--space-4)' }}>{bg.name}</h3>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <span className="badge badge-gold">+2 {capitalize(bg.asi_primary)}</span>
        <span className="badge badge-muted">+1 {capitalize(bg.asi_secondary)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <div className="section-header">Skill Proficiencies</div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {bg.skill_proficiencies.join(', ')}
          </p>
        </div>
        {bg.tool_proficiency && (
          <div>
            <div className="section-header">Tool Proficiency</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{bg.tool_proficiency}</p>
          </div>
        )}
        {bg.languages > 0 && (
          <div>
            <div className="section-header">Languages</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>+{bg.languages} language{bg.languages > 1 ? 's' : ''}</p>
          </div>
        )}
        <div>
          <div className="section-header">{bg.feature_name}</div>
          <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>{bg.feature_description}</p>
        </div>
        <div>
          <div className="section-header">Starting Equipment</div>
          <ul style={{ listStyle: 'disc', paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {bg.starting_equipment.map((item, i) => (
              <li key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
