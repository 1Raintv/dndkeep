import { useState } from 'react';
import type { ChoiceType, LevelMilestone } from '../../data/levelProgression';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';

interface LevelProgressionPanelProps {
  className: string;
  subclass: string;
  level: number;       // show levels 1 → level
}

// Colour palette per choice type
const CHOICE_COLORS: Record<ChoiceType, { bg: string; border: string; text: string; icon: string }> = {
  asi:             { bg: 'rgba(201,146,42,0.15)',  border: 'var(--c-gold)',         text: 'var(--c-gold-l)',          icon: '⬆' },
  subclass:        { bg: 'rgba(167,139,250,0.15)', border: '#a78bfa',                  text: '#c4b5fd',                   icon: '✦' },
  fighting_style:  { bg: 'rgba(96,165,250,0.12)',  border: '#60a5fa',                  text: '#93c5fd',                   icon: '⚔' },
  expertise:       { bg: 'rgba(52,211,153,0.12)',  border: '#34d399',                  text: '#6ee7b7',                   icon: '◆' },
  spells:          { bg: 'rgba(251,191,36,0.1)',   border: '#fbbf24',                  text: '#fcd34d',                   icon: '✧' },
  cantrips:        { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.5)',     text: '#fcd34d',                   icon: '✦' },
  invocations:     { bg: 'rgba(248,113,113,0.1)',  border: '#f87171',                  text: '#fca5a5',                   icon: '👁' },
  metamagic:       { bg: 'rgba(217,70,239,0.1)',   border: '#d946ef',                  text: '#e879f9',                   icon: '◈' },
  mystic_arcanum:  { bg: 'rgba(248,113,113,0.12)', border: '#ef4444',                  text: '#fca5a5',                   icon: '📜' },
  magical_secrets: { bg: 'rgba(251,191,36,0.15)',  border: 'var(--c-gold)',         text: 'var(--c-gold-l)',          icon: '✦' },
  pact_boon:       { bg: 'rgba(248,113,113,0.12)', border: '#f87171',                  text: '#fca5a5',                   icon: '⛓' },
  divine_order:    { bg: 'rgba(250,204,21,0.1)',   border: '#facc15',                  text: '#fef08a',                   icon: '☀' },
  primal_order:    { bg: 'rgba(52,211,153,0.1)',   border: '#34d399',                  text: '#6ee7b7',                   icon: '🌿' },
  epic_boon:       { bg: 'rgba(201,146,42,0.2)',   border: 'var(--c-gold)',         text: 'var(--c-gold-l)',  icon: '★' },
  other:           { bg: 'rgba(156,163,175,0.1)',  border: 'var(--c-border-m)',         text: 'var(--t-2)',     icon: '◉' },
};

const SPELL_LEVEL_ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

function ChoiceBadge({ type, label }: { type: ChoiceType; label: string }) {
  const c = CHOICE_COLORS[type];
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: '999px',
      border: `1px solid ${c.border}`,
      background: c.bg,
      fontSize: 'var(--fs-xs)',
      fontFamily: 'var(--ff-body)',
      color: c.text,
      fontWeight: 600,
      letterSpacing: '0.03em',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '10px' }}>{c.icon}</span>
      {label}
    </div>
  );
}

function LevelRow({ milestone, isLast, subclassName }: {
  milestone: LevelMilestone;
  isLast: boolean;
  subclassName: string;
}) {
  const hasContent = milestone.features.length > 0 || (milestone.choices?.length ?? 0) > 0
    || milestone.subclassFeature || milestone.newSpellLevel;

  const isSubclassLevel = milestone.choices?.some(c => c.type === 'subclass');
  const isASILevel = milestone.choices?.some(c => c.type === 'asi');

  // Highlight colour for the level badge
  const badgeColor = isSubclassLevel ? '#a78bfa'
    : isASILevel ? 'var(--c-gold)'
    : milestone.level === 1 ? 'var(--c-gold)'
    : 'var(--t-2)';

  const badgeBg = isSubclassLevel ? 'rgba(167,139,250,0.2)'
    : isASILevel ? 'rgba(201,146,42,0.15)'
    : milestone.level === 1 ? 'rgba(201,146,42,0.1)'
    : '#080d14';

  return (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', position: 'relative' }}>
      {/* Timeline spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)',
          border: `2px solid ${badgeColor}`,
          background: badgeBg,
          color: badgeColor,
          zIndex: 1,
        }}>
          {milestone.level}
        </div>
        {!isLast && (
          <div style={{ width: 2, flexGrow: 1, minHeight: 12, background: 'var(--c-border)', margin: '2px 0' }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 'var(--sp-4)', paddingTop: 4 }}>
        {/* Class features */}
        {milestone.features.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: hasContent ? 'var(--sp-2)' : 0 }}>
            {milestone.features.map(f => (
              <span key={f} style={{
                fontFamily: 'var(--ff-body)',
                fontSize: 'var(--fs-xs)',
                color: 'var(--t-2)',
                background: '#080d14',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-sm)',
                padding: '1px 8px',
              }}>
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Subclass feature note */}
        {milestone.subclassFeature && (
          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <ChoiceBadge type="other" label={subclassName ? `${subclassName} feature` : 'Subclass feature'} />
          </div>
        )}

        {/* New spell level access */}
        {milestone.newSpellLevel && (
          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <span style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)',
              color: '#fcd34d', background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: 'var(--r-sm)', padding: '1px 8px',
            }}>
              ✧ Unlocks {SPELL_LEVEL_ORDINALS[milestone.newSpellLevel]}-level spells
            </span>
          </div>
        )}

        {/* Choices */}
        {milestone.choices && milestone.choices.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            {milestone.choices.map((c, i) => (
              <ChoiceBadge key={i} type={c.type} label={c.label} />
            ))}
          </div>
        )}

        {/* Empty level note */}
        {!hasContent && (
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontStyle: 'italic' }}>
            Spell slot progression
          </span>
        )}
      </div>
    </div>
  );
}

export default function LevelProgressionPanel({ className, subclass, level }: LevelProgressionPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const progression = CLASS_LEVEL_PROGRESSION[className];
  if (!progression) return null;

  const milestones = progression.filter(m => m.level <= level);

  // Quick stats
  const asiCount  = milestones.filter(m => m.choices?.some(c => c.type === 'asi')).length;
  const subclassAt = milestones.find(m => m.choices?.some(c => c.type === 'subclass'))?.level;

  return (
    <div style={{ marginTop: 'var(--sp-6)' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--c-raised)', borderRadius: 'var(--r-md)',
          border: '1px solid var(--c-gold-bdr)',
        }}
      >
        <div>
          <span style={{
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)',
            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-gold-l)',
          }}>
            Level Progression — {className}{subclass ? ` (${subclass})` : ''}
          </span>
          <span style={{ marginLeft: 'var(--sp-3)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            Levels 1–{level}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          {subclassAt && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: '#a78bfa' }}>
              Subclass @ {subclassAt}
            </span>
          )}
          {asiCount > 0 && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)' }}>
              {asiCount} ASI{asiCount !== 1 ? 's' : ''}
            </span>
          )}
          <span style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{
          marginTop: 'var(--sp-3)',
          padding: 'var(--sp-4)',
          background: '#080d14',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--c-border)',
          maxHeight: 480,
          overflowY: 'auto',
        }}>
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', paddingBottom: 'var(--sp-3)', borderBottom: '1px solid var(--c-border)' }}>
            {[
              { type: 'asi' as ChoiceType,       label: 'ASI / Feat' },
              { type: 'subclass' as ChoiceType,  label: 'Subclass' },
              { type: 'spells' as ChoiceType,    label: 'Spells' },
              { type: 'other' as ChoiceType,     label: 'Class Feature' },
            ].map(item => (
              <ChoiceBadge key={item.type} type={item.type} label={item.label} />
            ))}
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', alignSelf: 'center', marginLeft: 4 }}>
              = choices to make
            </span>
          </div>

          {milestones.map((m, i) => (
            <LevelRow
              key={m.level}
              milestone={m}
              isLast={i === milestones.length - 1}
              subclassName={subclass}
            />
          ))}
        </div>
      )}
    </div>
  );
}
