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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', margin: 0 }}>
        In 2024, backgrounds grant your ability score improvements: <strong>+2 to one ability, +1 to another.</strong>
      </p>

      {/* Background grid — 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)' }}>
        {BACKGROUNDS.map(bg => (
          <BackgroundCard key={bg.name} bg={bg} selected={selected === bg.name} onSelect={onSelect} />
        ))}
      </div>

      {/* Detail panel — only when selected, at bottom */}
      {preview && (
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }} className="animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--t-1)' }}>{preview.name}</span>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '3px 10px', borderRadius: 999 }}>
              +2 {capitalize(preview.asi_primary)}
            </span>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--t-2)', background: 'var(--c-raised)', border: '1px solid var(--c-border-m)', padding: '3px 10px', borderRadius: 999 }}>
              +1 {capitalize(preview.asi_secondary)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--sp-4)' }}>
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Skill Proficiencies</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{preview.skill_proficiencies.join(', ')}</div>
            </div>
            {preview.tool_proficiency && (
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Tool Proficiency</div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{preview.tool_proficiency}</div>
              </div>
            )}
            {preview.languages > 0 && (
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Languages</div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-blue-l)' }}>+{preview.languages} language{preview.languages > 1 ? 's' : ''}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{preview.feature_name}</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.5 }}>{preview.feature_description}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Starting Equipment</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {preview.starting_equipment.map((item, i) => (
                <span key={i} style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', padding: '2px 8px', borderRadius: 999 }}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BackgroundCard({ bg, selected, onSelect }: { bg: BackgroundData; selected: boolean; onSelect: (n: string) => void }) {
  return (
    <button onClick={() => onSelect(bg.name)} style={{
      padding: 'var(--sp-3)', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
      border: selected ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
      background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
      transition: 'all var(--tr-fast)', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: selected ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{bg.name}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '1px 5px', borderRadius: 999 }}>+2 {bg.asi_primary.slice(0,3).toUpperCase()}</span>
        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-2)', background: 'var(--c-raised)', border: '1px solid var(--c-border-m)', padding: '1px 5px', borderRadius: 999 }}>+1 {bg.asi_secondary.slice(0,3).toUpperCase()}</span>
      </div>
    </button>
  );
}
