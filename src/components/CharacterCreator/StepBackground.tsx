import { BACKGROUNDS } from '../../data/backgrounds';
import { capitalize } from '../../lib/gameUtils';

interface StepBackgroundProps {
  selected: string;
  onSelect: (name: string) => void;
}

const BG_ICONS: Record<string, string> = {
  Acolyte:'✝️', Artisan:'🔨', Charlatan:'🎭', Criminal:'🗡️',
  Entertainer:'🎵', Farmer:'🌾', Guard:'🛡️', Guide:'🗺️',
  Hermit:'🏔️', Merchant:'💰', Noble:'👑', Sailor:'⚓',
  Scholar:'📖', Scribe:'✍️', Soldier:'⚔️', Wayfarer:'🧳',
  'Folk Hero':'🌟', Sage:'🔮',
};

export default function StepBackground({ selected, onSelect }: StepBackgroundProps) {
  const preview = BACKGROUNDS.find(b => b.name === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      <p style={{ color: 'var(--t-3)', fontSize: 'var(--fs-xs)', margin: 0, lineHeight: 1.5 }}>
        Your background grants <strong style={{ color: 'var(--c-gold-l)' }}>+2 to one ability, +1 to another</strong> — the primary source of ability score bonuses in 2024.
      </p>

      {/* Background grid — 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--sp-2)' }}>
        {BACKGROUNDS.map(bg => {
          const icon = BG_ICONS[bg.name] ?? '⭐';
          const sel = selected === bg.name;
          return (
            <button key={bg.name} onClick={() => onSelect(bg.name)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px', borderRadius: 'var(--r-md)', textAlign: 'left',
              border: sel ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
              background: sel ? 'var(--c-gold-bg)' : 'var(--c-raised)',
              cursor: 'pointer', transition: 'all var(--tr-fast)',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: 600,
                color: sel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{bg.name}</span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gold-l)',
                  background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)',
                  padding: '1px 6px', borderRadius: 999 }}>
                  +2 {bg.asi_primary.slice(0,3).toUpperCase()}
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-2)',
                  background: 'var(--c-raised)', border: '1px solid var(--c-border-m)',
                  padding: '1px 6px', borderRadius: 999 }}>
                  +1 {bg.asi_secondary.slice(0,3).toUpperCase()}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Preview panel — below grid */}
      {preview ? (
        <div className="animate-fade-in" style={{
          background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
          borderRadius: 'var(--r-xl)', padding: 'var(--sp-4) var(--sp-5)',
          display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--t-1)' }}>{preview.name}</span>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)',
              background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)',
              padding: '3px 12px', borderRadius: 999 }}>
              +2 {capitalize(preview.asi_primary)}
            </span>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--t-2)',
              background: 'var(--c-raised)', border: '1px solid var(--c-border-m)',
              padding: '3px 12px', borderRadius: 999 }}>
              +1 {capitalize(preview.asi_secondary)}
            </span>
          </div>

          {/* Detail chips */}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <InfoChip label="Skills" value={preview.skill_proficiencies.join(', ')} />
            {preview.tool_proficiency && <InfoChip label="Tool" value={preview.tool_proficiency} />}
            {preview.languages > 0 && <InfoChip label="Languages" value={`${preview.languages} of choice`} />}
          </div>

          {/* Starting equipment */}
          {preview.starting_equipment?.length > 0 && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Equipment: </span>
              {preview.starting_equipment.join(', ')}
            </div>
          )}

          {/* Feature */}
          {preview.feature_name && (
            <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-raised)',
              borderRadius: 'var(--r-lg)', borderLeft: '2px solid var(--c-gold)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)', marginBottom: 4 }}>
                {preview.feature_name}
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5 }}>
                {preview.feature_description}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--t-3)',
          background: 'var(--c-card)', border: '1px dashed var(--c-border-m)', borderRadius: 'var(--r-xl)' }}>
          
          <div style={{ fontSize: 'var(--fs-sm)' }}>Select a background to see details</div>
        </div>
      )}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '4px 12px', background: 'var(--c-raised)', border: '1px solid var(--c-border-m)',
      borderRadius: 999, display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-1)' }}>{value}</span>
    </div>
  );
}
