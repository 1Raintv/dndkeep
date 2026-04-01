import type { BackgroundData } from '../../types';
import { BACKGROUNDS } from '../../data/backgrounds';
import { capitalize } from '../../lib/gameUtils';

interface StepBackgroundProps {
  selected: string;
  onSelect: (name: string) => void;
}

const BG_ICONS: Record<string, string> = {
  Acolyte: '✝️', Artisan: '🔨', Charlatan: '🎭', Criminal: '🗡️',
  Entertainer: '🎵', Farmer: '🌾', Guard: '🛡️', Guide: '🗺️',
  Hermit: '🏔️', Merchant: '💰', Noble: '👑', Sailor: '⚓',
  Scholar: '📖', Scribe: '✍️', Soldier: '⚔️', Wayfarer: '🧳',
  'Folk Hero': '🌟', Sage: '🔮',
};

export default function StepBackground({ selected, onSelect }: StepBackgroundProps) {
  const preview = BACKGROUNDS.find(b => b.name === selected);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--sp-6)' }}>

      {/* ── Left: background list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
        <p style={{ color: 'var(--t-3)', fontSize: 'var(--fs-xs)', margin: '0 0 8px', lineHeight: 1.5 }}>
          Backgrounds grant <strong style={{ color: 'var(--c-gold-l)' }}>+2 to one ability, +1 to another</strong> plus skills, equipment, and a feat.
        </p>
        {BACKGROUNDS.map(bg => (
          <BackgroundRow key={bg.name} bg={bg} selected={selected === bg.name} onSelect={onSelect} />
        ))}
      </div>

      {/* ── Right: background preview ── */}
      <div>
        {preview ? (
          <BackgroundPreview bg={preview} />
        ) : (
          <div style={{
            height: 280, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            background: 'var(--c-card)', border: '1px dashed var(--c-border-m)',
            borderRadius: 'var(--r-xl)', color: 'var(--t-3)',
          }}>
            <span style={{ fontSize: 36 }}>🎒</span>
            <span style={{ fontSize: 'var(--fs-sm)' }}>Select a background to see details</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BackgroundRow({ bg, selected, onSelect }: { bg: BackgroundData; selected: boolean; onSelect: (n: string) => void }) {
  const icon = BG_ICONS[bg.name] ?? '⭐';
  return (
    <button
      onClick={() => onSelect(bg.name)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 11px', borderRadius: 'var(--r-md)',
        border: selected ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
        background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
        cursor: 'pointer', transition: 'all var(--tr-fast)', textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: 600, color: selected ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
        {bg.name}
      </span>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', padding: '1px 5px', borderRadius: 999 }}>
          +2 {bg.asi_primary.slice(0,3).toUpperCase()}
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-2)', background: 'var(--c-raised)', border: '1px solid var(--c-border-m)', padding: '1px 5px', borderRadius: 999 }}>
          +1 {bg.asi_secondary.slice(0,3).toUpperCase()}
        </span>
      </div>
    </button>
  );
}

function BackgroundPreview({ bg }: { bg: BackgroundData }) {
  return (
    <div className="animate-fade-in" style={{
      background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
      borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)',
      display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)',
    }}>
      {/* Header */}
      <div>
        <h3 style={{ margin: '0 0 8px', color: 'var(--t-1)' }}>{bg.name}</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '3px 10px', borderRadius: 999 }}>
            +2 {capitalize(bg.asi_primary)}
          </span>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--t-2)', background: 'var(--c-raised)', border: '1px solid var(--c-border-m)', padding: '3px 10px', borderRadius: 999 }}>
            +1 {capitalize(bg.asi_secondary)}
          </span>
        </div>
      </div>

      {/* Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
        <DetailRow label="Skill Proficiencies" value={bg.skill_proficiencies.join(', ')} />
        {bg.tool_proficiency && (
          <DetailRow label="Tool Proficiencies" value={bg.tool_proficiency || ''} />
        )}
        {bg.languages > 0 && (
          <DetailRow label="Languages" value={`${bg.languages} of your choice`} />
        )}
        {(bg as any).origin_feat && (
          <DetailRow label="Origin Feat" value={(bg as any).origin_feat} />
        )}
      </div>

      {/* Equipment */}
      {bg.starting_equipment?.length > 0 && (
        <div>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t-3)', marginBottom: 6 }}>Starting Equipment</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.5 }}>
            {bg.starting_equipment.join(', ')}
          </div>
        </div>
      )}

      {/* Feature */}
      {bg.feature_name && (
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-raised)', borderRadius: 'var(--r-lg)', borderLeft: '2px solid var(--c-gold)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)', marginBottom: 4 }}>
            {bg.feature_name}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5 }}>
            {bg.feature_description}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t-3)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{value}</div>
    </div>
  );
}
