import { useState } from 'react';
import type { Character } from '../../types';
import { FEATS } from '../../data/feats';

interface FeatsPanelProps {
  character: Character;
}

// Feats that have active uses (action, bonus action, resource, etc.)
const ACTIVE_FEAT_KEYWORDS = [
  'magic action', 'bonus action', 'reaction', 'once per',
  'luck point', 'spend', 'expend', 'per long rest', 'per short rest',
];

function isActiveFeat(benefits: string[]): boolean {
  return benefits.some(b =>
    ACTIVE_FEAT_KEYWORDS.some(kw => b.toLowerCase().includes(kw))
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  'origin': 'Origin',
  'general': 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
};

const CATEGORY_COLORS: Record<string, string> = {
  'origin': '#60a5fa',
  'general': '#a78bfa',
  'fighting-style': '#f87171',
  'epic-boon': '#fbbf24',
};

export default function FeatsPanel({ character }: FeatsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const featNames = character.gained_feats ?? [];

  // Parse feats from features_and_traits as fallback for old characters
  const legacyFeats: string[] = [];
  if (featNames.length === 0 && character.features_and_traits) {
    const matches = character.features_and_traits.matchAll(
      /\[(?:Origin Feat|Feat — Level \d+|Feats from ASI[^\]]*)\]\n([^\n[]+)/g
    );
    for (const m of matches) {
      const raw = m[1].trim();
      // "Alert: description" or "Level 4: Alert"
      const name = raw.includes(':') ? raw.split(':')[0].replace(/^Level \d+ /, '').trim() : raw.trim();
      if (name && !legacyFeats.includes(name)) legacyFeats.push(name);
    }
    // Also check "Level N: FeatName" pattern
    const levelFeats = character.features_and_traits.matchAll(/Level \d+: ([^\n]+)/g);
    for (const m of levelFeats) {
      const name = m[1].trim();
      if (name && !legacyFeats.includes(name)) legacyFeats.push(name);
    }
  }

  const allFeatNames = featNames.length > 0 ? featNames : legacyFeats;

  if (allFeatNames.length === 0) {
    return (
      <div style={{
        padding: 'var(--sp-4)', borderRadius: 'var(--r-lg)',
        border: '1px dashed var(--c-border)', textAlign: 'center',
        color: 'var(--t-3)', fontSize: 13, fontFamily: 'var(--ff-body)',
      }}>
        No feats yet — gain feats by leveling up (ASI → Take a Feat)
      </div>
    );
  }

  // Resolve feat data for each name
  const feats = allFeatNames.map(name => ({
    name,
    data: FEATS.find(f => f.name === name),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {feats.map(({ name, data }) => {
        const isOpen = expanded === name;
        const active = data ? isActiveFeat(data.benefits) : false;
        const catColor = data ? (CATEGORY_COLORS[data.category] ?? '#a78bfa') : '#a78bfa';
        const catLabel = data ? (CATEGORY_LABELS[data.category] ?? data.category) : '';

        return (
          <div
            key={name}
            style={{
              borderRadius: 'var(--r-lg)',
              border: `1px solid ${isOpen ? catColor + '50' : 'var(--c-border-m)'}`,
              background: isOpen ? catColor + '08' : 'var(--c-surface)',
              overflow: 'hidden',
              transition: 'all var(--tr-fast)',
            }}
          >
            {/* Header — always visible */}
            <button
              onClick={() => setExpanded(isOpen ? null : name)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              {/* Active badge */}
              {active && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  color: '#fbbf24', background: 'rgba(251,191,36,0.12)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: 999, padding: '1px 6px', flexShrink: 0,
                }}>⚡ ACTIVE</span>
              )}
              {!active && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  color: 'var(--t-3)', background: 'var(--c-raised)',
                  border: '1px solid var(--c-border-m)',
                  borderRadius: 999, padding: '1px 6px', flexShrink: 0,
                }}>PASSIVE</span>
              )}

              <span style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700,
                fontSize: 14, color: 'var(--t-1)', flex: 1,
              }}>
                {name}
              </span>

              {catLabel && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  color: catColor, background: catColor + '15',
                  border: `1px solid ${catColor}40`,
                  borderRadius: 999, padding: '1px 7px',
                }}>
                  {catLabel.toUpperCase()}
                </span>
              )}

              <span style={{ color: 'var(--t-3)', fontSize: 12, marginLeft: 4 }}>
                {isOpen ? '▲' : '▼'}
              </span>
            </button>

            {/* Expanded detail */}
            {isOpen && data && (
              <div style={{ padding: '0 14px 12px' }}>
                {/* Description */}
                <div style={{
                  fontFamily: 'var(--ff-body)', fontSize: 12,
                  color: 'var(--t-2)', lineHeight: 1.5, marginBottom: 10,
                  fontStyle: 'italic',
                }}>
                  {data.description}
                </div>

                {/* Benefits */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.benefits.map((benefit, i) => {
                    const benefitLower = benefit.toLowerCase();
                    const isActionBenefit = ACTIVE_FEAT_KEYWORDS.some(kw => benefitLower.includes(kw));
                    return (
                      <div
                        key={i}
                        style={{
                          padding: '8px 12px',
                          background: isActionBenefit ? 'rgba(251,191,36,0.06)' : 'var(--c-raised)',
                          border: `1px solid ${isActionBenefit ? 'rgba(251,191,36,0.2)' : 'var(--c-border)'}`,
                          borderRadius: 'var(--r-md)',
                          fontFamily: 'var(--ff-body)', fontSize: 12,
                          color: 'var(--t-2)', lineHeight: 1.6,
                        }}
                      >
                        {isActionBenefit && (
                          <span style={{ color: '#fbbf24', fontWeight: 700, marginRight: 5 }}>⚡</span>
                        )}
                        {benefit}
                      </div>
                    );
                  })}
                </div>

                {/* Prerequisite note */}
                {data.prerequisite && (
                  <div style={{
                    marginTop: 8, fontSize: 11, color: 'var(--t-3)',
                    fontFamily: 'var(--ff-body)', fontStyle: 'italic',
                  }}>
                    Prerequisite: {data.prerequisite}
                  </div>
                )}
              </div>
            )}

            {/* Unknown feat fallback */}
            {isOpen && !data && (
              <div style={{ padding: '0 14px 12px', fontSize: 12, color: 'var(--t-3)', fontFamily: 'var(--ff-body)' }}>
                Feat details not found in database. Check the Bio tab for full description.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
