import { useState } from 'react';
import type { Character } from '../../types';
import { FEATS } from '../../data/feats';

interface FeatsPanelProps {
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}

const ACTIVE_KW = [
  'magic action', 'bonus action', 'reaction', 'once per',
  'luck point', 'spend', 'expend', 'per long rest', 'per short rest',
];

function isActiveFeat(benefits: string[]): boolean {
  return benefits.some(b => ACTIVE_KW.some(kw => b.toLowerCase().includes(kw)));
}

const CATEGORY_COLORS: Record<string, string> = {
  'origin': '#60a5fa',
  'general': '#a78bfa',
  'fighting-style': '#f87171',
  'epic-boon': '#fbbf24',
};

const CATEGORY_LABELS: Record<string, string> = {
  'origin': 'Origin',
  'general': 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
};

export default function FeatsPanel({ character, onUpdate }: FeatsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const featNames: string[] = character.gained_feats ?? [];

  function addFeat(name: string) {
    if (featNames.includes(name)) return;
    onUpdate({ gained_feats: [...featNames, name] });
    setAdding(false);
    setSearch('');
    setExpanded(name);
  }

  function removeFeat(name: string) {
    if (!confirm(`Remove "${name}" from feats?`)) return;
    onUpdate({ gained_feats: featNames.filter(f => f !== name) });
    if (expanded === name) setExpanded(null);
  }

  const available = FEATS.filter(f =>
    !featNames.includes(f.name) &&
    (search === '' ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase()) ||
      f.benefits.some(b => b.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>

      {featNames.length === 0 && !adding && (
        <div style={{
          padding: 'var(--sp-4)', borderRadius: 'var(--r-lg)',
          border: '1px dashed var(--c-border)', textAlign: 'center' as const,
          color: 'var(--t-3)', fontSize: 13, fontFamily: 'var(--ff-body)',
        }}>
          No feats yet — use <strong style={{ color: 'var(--c-gold-l)' }}>Level Up</strong> at an ASI level, or add one below.
        </div>
      )}

      {featNames.map(name => {
        const data = FEATS.find(f => f.name === name);
        const isOpen = expanded === name;
        const active = data ? isActiveFeat(data.benefits) : false;
        const catColor = data ? (CATEGORY_COLORS[data.category] ?? '#a78bfa') : '#a78bfa';
        const catLabel = data ? (CATEGORY_LABELS[data.category] ?? data.category) : '';

        return (
          <div key={name} style={{
            borderRadius: 'var(--r-lg)',
            border: `1px solid ${isOpen ? catColor + '50' : 'var(--c-border-m)'}`,
            background: isOpen ? catColor + '08' : 'var(--c-surface)',
            overflow: 'hidden', transition: 'all var(--tr-fast)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setExpanded(isOpen ? null : name)}
                style={{
                  flex: 1, textAlign: 'left', padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', flexShrink: 0,
                  color: active ? '#fbbf24' : 'var(--t-3)',
                  background: active ? 'rgba(251,191,36,0.12)' : 'var(--c-raised)',
                  border: `1px solid ${active ? 'rgba(251,191,36,0.3)' : 'var(--c-border-m)'}`,
                  borderRadius: 999, padding: '1px 6px',
                }}>
                  {active ? '⚡ ACTIVE' : 'PASSIVE'}
                </span>

                <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: 'var(--t-1)', flex: 1 }}>
                  {name}
                </span>

                {catLabel && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0,
                    color: catColor, background: catColor + '15',
                    border: `1px solid ${catColor}40`,
                    borderRadius: 999, padding: '1px 7px',
                  }}>
                    {catLabel.toUpperCase()}
                  </span>
                )}
                <span style={{ color: 'var(--t-3)', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
              </button>
              <button
                onClick={() => removeFeat(name)}
                title="Remove feat"
                style={{
                  padding: '8px 12px', background: 'transparent',
                  border: 'none', cursor: 'pointer', color: 'var(--t-3)', fontSize: 13,
                  borderLeft: '1px solid var(--c-border)', flexShrink: 0,
                }}
              >✕</button>
            </div>

            {isOpen && data && (
              <div style={{ padding: '0 14px 12px' }}>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5, marginBottom: 10, fontStyle: 'italic' }}>
                  {data.description}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.benefits.map((benefit, i) => {
                    const ba = ACTIVE_KW.some(kw => benefit.toLowerCase().includes(kw));
                    return (
                      <div key={i} style={{
                        padding: '8px 12px',
                        background: ba ? 'rgba(251,191,36,0.06)' : 'var(--c-raised)',
                        border: `1px solid ${ba ? 'rgba(251,191,36,0.2)' : 'var(--c-border)'}`,
                        borderRadius: 'var(--r-md)',
                        fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6,
                      }}>
                        {ba && <span style={{ color: '#fbbf24', fontWeight: 700, marginRight: 5 }}>⚡</span>}
                        {benefit}
                      </div>
                    );
                  })}
                </div>
                {data.prerequisite && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--t-3)', fontFamily: 'var(--ff-body)', fontStyle: 'italic' }}>
                    Prerequisite: {data.prerequisite}
                  </div>
                )}
              </div>
            )}
            {isOpen && !data && (
              <div style={{ padding: '0 14px 12px', fontSize: 12, color: 'var(--t-3)', fontFamily: 'var(--ff-body)' }}>
                Feat details not in database. Check the Bio tab for full description.
              </div>
            )}
          </div>
        );
      })}

      {/* Add Feat UI */}
      {adding ? (
        <div style={{
          borderRadius: 'var(--r-lg)', border: '1px solid var(--c-gold-bdr)',
          background: 'var(--c-gold-bg)', padding: 'var(--sp-3)',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Search feats by name or benefit..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 'var(--r-md)',
                border: '1px solid var(--c-gold-bdr)', background: 'var(--c-card)',
                color: 'var(--t-1)', fontFamily: 'var(--ff-body)', fontSize: 13, outline: 'none',
              }}
            />
            <button onClick={() => { setAdding(false); setSearch(''); }} className="btn-ghost btn-sm">
              Cancel
            </button>
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {available.length === 0 && (
              <div style={{ color: 'var(--t-3)', fontSize: 12, fontFamily: 'var(--ff-body)', textAlign: 'center', padding: 8 }}>
                No matching feats
              </div>
            )}
            {available.map(feat => {
              const catColor = CATEGORY_COLORS[feat.category] ?? '#a78bfa';
              const catLabel = CATEGORY_LABELS[feat.category] ?? feat.category;
              const active = isActiveFeat(feat.benefits);
              return (
                <button
                  key={feat.name}
                  onClick={() => addFeat(feat.name)}
                  style={{
                    textAlign: 'left', padding: '8px 12px', cursor: 'pointer',
                    borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)',
                    background: 'var(--c-card)', transition: 'all var(--tr-fast)',
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>
                      {feat.name}
                    </span>
                    {active && (
                      <span style={{ fontSize: 9, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 5px', fontWeight: 700 }}>
                        ⚡ ACTIVE
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: catColor, background: catColor + '15', border: `1px solid ${catColor}40`, borderRadius: 999, padding: '1px 5px', fontWeight: 700 }}>
                      {catLabel.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4 }}>
                    {feat.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: '8px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
            border: '1px dashed var(--c-gold-bdr)', background: 'transparent',
            color: 'var(--c-gold-l)', fontFamily: 'var(--ff-body)', fontWeight: 600,
            fontSize: 12, letterSpacing: '0.04em', transition: 'all var(--tr-fast)',
          }}
        >
          + Add Feat
        </button>
      )}
    </div>
  );
}
