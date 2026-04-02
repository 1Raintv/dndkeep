import { useState, useMemo } from 'react';
import { FEATS, type FeatData } from '../../data/feats';

interface FeatPickerProps {
  selected: string | null;
  onSelect: (featName: string | null) => void;
  /** Only show general feats (default true) */
  generalOnly?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  'origin': 'Origin', 'general': 'General', 'fighting-style': 'Fighting Style', 'epic-boon': 'Epic Boon',
};

export default function FeatPicker({ selected, onSelect, generalOnly = true }: FeatPickerProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const feats = useMemo(() => {
    const base = generalOnly ? FEATS.filter(f => f.category === 'general') : FEATS;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.benefits?.some(b => b.toLowerCase().includes(q))
    );
  }, [search, generalOnly]);

  const selectedFeat = FEATS.find(f => f.name === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Selected feat banner */}
      {selectedFeat && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(212,160,23,0.08)', border: '2px solid var(--c-gold-bdr)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-gold-l)' }}>
              ✓ {selectedFeat.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t-2)', marginTop: 2 }}>
              {selectedFeat.description}
            </div>
          </div>
          <button
            onClick={() => onSelect(null)}
            style={{ fontSize: 11, color: 'var(--t-3)', background: 'none', border: '1px solid var(--c-border-m)', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
          >
            Change
          </button>
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search feats by name or effect…"
        style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)', width: '100%' }}
      />

      {/* Count */}
      <div style={{ fontSize: 10, color: 'var(--t-3)', letterSpacing: '0.04em' }}>
        {feats.length} feat{feats.length !== 1 ? 's' : ''} available
        {!generalOnly && ' (all categories)'}
        {' · click to expand · click Select to choose'}
      </div>

      {/* Feat list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
        {feats.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--t-3)', fontSize: 13 }}>
            No feats match "{search}"
          </div>
        )}
        {feats.map(feat => {
          const isSel = selected === feat.name;
          const isExp = expanded === feat.name;

          return (
            <div
              key={feat.name}
              style={{
                borderRadius: 10,
                border: `${isSel ? '2px' : '1px'} solid ${isSel ? 'var(--c-gold)' : isExp ? 'var(--c-border-m)' : 'var(--c-border)'}`,
                background: isSel ? 'rgba(212,160,23,0.08)' : 'var(--c-card)',
                overflow: 'hidden',
                transition: 'border-color 0.15s ease',
              }}
            >
              {/* Row header — always visible, always readable */}
              <div
                onClick={() => setExpanded(isExp ? null : feat.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', cursor: 'pointer', minHeight: 44,
                }}
              >
                {/* Selection radio dot */}
                <div
                  onClick={e => { e.stopPropagation(); onSelect(isSel ? null : feat.name); }}
                  style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                    border: `2px solid ${isSel ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
                    background: isSel ? 'var(--c-gold)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                />

                {/* Feat name + badges */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: isSel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                      {feat.name}
                    </span>
                    {feat.prerequisite && (
                      <span style={{ fontSize: 9, color: 'var(--t-3)', background: 'var(--c-raised)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--c-border)' }}>
                        Req: {feat.prerequisite}
                      </span>
                    )}
                    {feat.repeatable && (
                      <span style={{ fontSize: 9, color: 'var(--c-blue-l)', background: 'var(--c-blue-bg)', padding: '1px 5px', borderRadius: 4 }}>
                        Repeatable
                      </span>
                    )}
                  </div>
                  {/* Short description always visible */}
                  <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: isExp ? 'unset' : 'ellipsis', whiteSpace: isExp ? 'normal' : 'nowrap' }}>
                    {feat.description}
                  </div>
                </div>

                {/* Chevron */}
                <span style={{
                  fontSize: 10, color: 'var(--t-3)', flexShrink: 0,
                  transform: isExp ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s ease',
                }}>▼</span>
              </div>

              {/* Expanded content */}
              {isExp && (
                <div style={{ borderTop: '1px solid var(--c-border)', padding: '12px 14px', background: 'rgba(255,255,255,0.02)' }}>
                  {/* Full description */}
                  <p style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65, margin: '0 0 10px' }}>
                    {feat.description}
                  </p>

                  {/* Benefits list */}
                  {feat.benefits && feat.benefits.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>
                        Benefits
                      </div>
                      {feat.benefits.map((b, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--c-gold-l)', fontSize: 12, flexShrink: 0, marginTop: 1 }}>•</span>
                          <span style={{ fontSize: 12, color: 'var(--t-1)', lineHeight: 1.55 }}>{b}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Select button */}
                  <button
                    onClick={() => { onSelect(isSel ? null : feat.name); setExpanded(null); }}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: '7px 18px',
                      borderRadius: 8, cursor: 'pointer', minHeight: 0,
                      border: `1px solid ${isSel ? 'var(--c-border-m)' : 'var(--c-gold-bdr)'}`,
                      background: isSel ? 'var(--c-raised)' : 'var(--c-gold-bg)',
                      color: isSel ? 'var(--t-2)' : 'var(--c-gold-l)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSel ? 'Deselect' : 'Select this feat'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
