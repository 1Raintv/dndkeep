import { useState, useMemo } from 'react';
import type { Character } from '../../types';
import { CLASS_FEATURES } from '../../data/classFeatures';
import { CLASS_MAP } from '../../data/classes';
import { CLASS_COMBAT_ABILITIES, PASSIVE_FEATURE_NAMES } from '../../data/classAbilities';
import FeatsPanel from './FeatsPanel';

interface Props {
  character: Character;
  onUpdate: (u: Partial<Character>) => void;
}

type Filter = 'all' | 'class' | 'species' | 'feats';

// Limited use features that need trackers in this panel
const TRACKER_CONFIG: Record<string, { rest: 'short' | 'long'; maxFn: (c: Character) => number }> = {
  'Rage':               { rest: 'long',  maxFn: c => c.level >= 20 ? 999 : c.level >= 17 ? 6 : c.level >= 12 ? 5 : c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2 },
  'Wild Shape':         { rest: 'short', maxFn: _c => 2 },
  'Action Surge':       { rest: 'short', maxFn: c => c.level >= 17 ? 2 : 1 },
  'Second Wind':        { rest: 'short', maxFn: _c => 1 },
  'Bardic Inspiration': { rest: 'short', maxFn: c => Math.max(1, Math.floor((c.charisma - 10) / 2)) },
  'Channel Divinity':   { rest: 'short', maxFn: c => c.level >= 18 ? 3 : c.level >= 6 ? 2 : 1 },
  'Hurl Through Hell':  { rest: 'long',  maxFn: _c => 1 },
  'Eldritch Master':    { rest: 'long',  maxFn: _c => 1 },
  'Mystic Arcanum':     { rest: 'long',  maxFn: _c => 1 },
  'Magical Cunning':    { rest: 'long',  maxFn: _c => 1 },
  'Contact Patron':     { rest: 'long',  maxFn: _c => 1 },
  'Divine Intervention':{ rest: 'long',  maxFn: _c => 1 },
  'Wholeness of Body':  { rest: 'long',  maxFn: _c => 1 },
  'Arcane Recovery':    { rest: 'long',  maxFn: _c => 1 },
  'Innate Sorcery':     { rest: 'long',  maxFn: _c => 2 },
};

function getTrackerConfig(featureName: string, c: Character) {
  for (const [key, cfg] of Object.entries(TRACKER_CONFIG)) {
    if (featureName.includes(key)) {
      return { max: cfg.maxFn(c), rest: cfg.rest };
    }
  }
  return null;
}

// Calculated values for features
function getCalcNote(name: string, c: Character): string {
  const level = c.level;
  const prof = c.proficiency_bonus ?? 2;
  const cha = Math.floor((c.charisma - 10) / 2);
  const wis = Math.floor((c.wisdom - 10) / 2);
  const int_ = Math.floor((c.intelligence - 10) / 2);
  const dex = Math.floor((c.dexterity - 10) / 2);
  const con = Math.floor((c.constitution - 10) / 2);

  if (name === 'Bardic Inspiration') {
    const die = level >= 15 ? 'd12' : level >= 10 ? 'd10' : level >= 5 ? 'd8' : 'd6';
    return `${die} • ${Math.max(1, cha)} use${Math.max(1, cha) !== 1 ? 's' : ''}/rest`;
  }
  if (name === 'Pact Magic') return `Spell DC ${8 + prof + cha} • Atk +${prof + cha}`;
  if (name === 'Spellcasting') {
    const mod = ['Wizard', 'Artificer'].includes(c.class_name) ? int_ :
      ['Cleric', 'Druid', 'Ranger', 'Monk'].includes(c.class_name) ? wis : cha;
    return `Spell DC ${8 + prof + mod} • Atk +${prof + mod}`;
  }
  if (name === 'Lay on Hands') return `Pool: ${level * 5} HP`;
  if (name === 'Sneak Attack') return `${Math.ceil(level / 2)}d6`;
  if (name === 'Rage') {
    const bonus = level >= 16 ? 4 : level >= 9 ? 3 : 2;
    const uses = level >= 20 ? '∞' : level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2;
    return `+${bonus} damage • ${uses} uses/Long Rest`;
  }
  if (name === 'Unarmored Defense' && c.class_name === 'Barbarian') {
    return `AC = 10 + ${dex >= 0 ? '+' : ''}${dex} Dex + ${con >= 0 ? '+' : ''}${con} Con`;
  }
  if (name === 'Aura of Protection') return `+${Math.max(1, cha)} to saves within 10 ft`;
  if (name.includes('Martial Arts')) {
    const die = level >= 17 ? 'd12' : level >= 11 ? 'd10' : level >= 5 ? 'd8' : 'd6';
    return `${die} unarmed strikes`;
  }
  if (name.includes("Monk's Focus") || name === 'Ki Points') return `${level} points/rest`;
  if (name === 'Sorcery Points') return `${level} points/rest`;
  if (name === 'Healing Light') return `${1 + level}d6 pool/rest`;
  if (name === "Dark One's Blessing") return `${cha + level} Temp HP on kill`;
  if (name === 'Flash of Genius') return `${Math.max(1, int_)} uses/Long Rest`;
  if (name === 'Wild Shape') return `CR ≤ ${Math.floor(level / 3)} • 2 uses/Short Rest`;
  if (name.includes('Eldritch Invocations')) {
    const count = level >= 17 ? 8 : level >= 15 ? 7 : level >= 12 ? 6 : level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : 2;
    return `${count} invocations known`;
  }
  if (name === 'Searing Vengeance') return `1 use/Long Rest`;
  if (name.includes('Channel Divinity')) {
    const uses = level >= 18 ? 3 : level >= 6 ? 2 : 1;
    return `${uses} uses/Short Rest`;
  }
  return '';
}

// Parse choices from features_and_traits text
function parseChoices(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const sections = text.split(/\n\n(?=\[)/);
  for (const section of sections) {
    const m = section.match(/^\[([^\]]+)\]\n([\s\S]*)$/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}

function getChoiceDisplay(featureName: string, character: Character, choices: Record<string, string>): string {
  const fn = featureName.toLowerCase();
  if (fn.includes('subclass feature') || fn === 'otherworldly patron') {
    return character.subclass ? `${character.subclass}` : '';
  }
  if (fn === 'pact boon') return choices['Pact Boon'] ?? '';
  if (fn.includes('eldritch invocation')) return choices['Eldritch Invocations'] ?? '';
  if (fn === 'fighting style') return choices['Fighting Style'] ?? '';
  if (fn.includes('metamagic')) return choices['Metamagic'] ?? '';
  if (fn === 'divine order') return choices['Divine Order'] ?? '';
  if (fn === 'primal order') return choices['Primal Order'] ?? '';
  if (fn === 'expertise' || fn.includes('expertise (')) return choices['Expertise'] ?? '';
  if (fn.includes('mystic arcanum (6th)')) return choices['Mystic Arcanum 6th'] ?? '';
  if (fn.includes('mystic arcanum (7th)')) return choices['Mystic Arcanum 7th'] ?? '';
  if (fn.includes('mystic arcanum (8th)')) return choices['Mystic Arcanum 8th'] ?? '';
  if (fn.includes('mystic arcanum (9th)')) return choices['Mystic Arcanum 9th'] ?? '';
  return '';
}

// Subclass features from classes.ts
function getSubclassFeatures(character: Character, featureLevel: number) {
  const classData = CLASS_MAP[character.class_name];
  if (!classData || !character.subclass) return [];
  const subcls = classData.subclasses?.find(s => s.name === character.subclass);
  return subcls?.features?.filter(f => f.level === featureLevel) ?? [];
}

// Check if a feature name has a combat ability entry
function getCombatAbility(featureName: string, className: string) {
  const abilities = CLASS_COMBAT_ABILITIES[className] ?? [];
  return abilities.find(a => featureName.toLowerCase().includes(a.name.toLowerCase()));
}

const ACTION_COLORS: Record<string, string> = {
  action:   '#60a5fa',
  bonus:    '#fbbf24',
  reaction: '#34d399',
  special:  '#c084fc',
  free:     'var(--t-3)',
};

// Use tracker component
function UseTracker({ featureKey, max, rest, character, onUpdate }: {
  featureKey: string; max: number; rest: 'short' | 'long';
  character: Character; onUpdate: (u: Partial<Character>) => void;
}) {
  const uses = ((character.feature_uses as Record<string, number>) ?? {})[featureKey] ?? 0;
  const remaining = max - uses;

  function toggle(targetUsed: number) {
    const clamped = Math.min(max, Math.max(0, targetUsed));
    onUpdate({ feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [featureKey]: clamped } });
  }

  if (max > 8) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <button onClick={() => toggle(uses + 1)} style={poolBtnStyle}>Use</button>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: remaining > 0 ? 'var(--c-gold-l)' : 'var(--t-3)', minWidth: 60, textAlign: 'center' as const }}>
          {remaining} / {max} remaining
        </span>
        <button onClick={() => toggle(0)} style={poolBtnStyle}>Reset</button>
        <span style={{ fontSize: 10, color: rest === 'short' ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--ff-body)' }}>
          {rest === 'short' ? 'Short/Long Rest' : 'Long Rest'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          onClick={() => toggle(i < uses ? i : i + 1)}
          title={i < uses ? 'Restore use' : 'Mark as used'}
          style={{
            width: 16, height: 16, borderRadius: 3, cursor: 'pointer', padding: 0,
            background: i < uses ? 'transparent' : 'var(--c-gold-l)',
            border: `2px solid ${i < uses ? 'var(--c-border-m)' : 'var(--c-gold-l)'}`,
            transition: 'all 0.15s',
          }}
        />
      ))}
      <span style={{ fontSize: 10, color: rest === 'short' ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--ff-body)', marginLeft: 3 }}>
        / {rest === 'short' ? 'Short Rest' : 'Long Rest'}
      </span>
    </div>
  );
}

const poolBtnStyle: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 'var(--r-sm)',
  background: 'var(--c-raised)', border: '1px solid var(--c-border)',
  color: 'var(--t-2)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-body)',
};

export default function FeaturesAndTraitsPanel({ character, onUpdate }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const choices = useMemo(
    () => parseChoices(character.features_and_traits ?? ''),
    [character.features_and_traits]
  );

  const classFeatures = useMemo(() => {
    const all = CLASS_FEATURES[character.class_name] ?? [];
    return all.filter(f => f.level <= character.level);
  }, [character.class_name, character.level]);

  // Parse species traits from features_and_traits
  const speciesSections = useMemo(() => {
    const text = character.features_and_traits ?? '';
    const sections: { title: string; traits: { name: string; desc: string; isActive: boolean }[] }[] = [];

    // Extract === Section === blocks
    const blocks = [...text.matchAll(/=== ([^=\n]+) (?:Traits|Features) ===\n([\s\S]*?)(?=\n===|$)/g)];
    for (const b of blocks) {
      const traitLines = b[2].trim().split('\n').filter(l => l.trim());
      const traits: { name: string; desc: string; isActive: boolean }[] = [];

      // Try to parse trait name: description lines
      let currentName = '';
      let currentDesc = '';
      for (const line of traitLines) {
        if (line.startsWith('Size:') || line.startsWith('Speed:') || line.includes('Speed:')) {
          traits.push({ name: 'Size & Speed', desc: line.trim(), isActive: true });
        } else if (!line.startsWith(' ') && line.includes('\n')) {
          if (currentName) traits.push({ name: currentName, desc: currentDesc.trim(), isActive: false });
          currentName = line.trim();
          currentDesc = '';
        } else {
          if (currentName) currentDesc += line + '\n';
          else traits.push({ name: line.trim().split(':')[0], desc: line.trim(), isActive: true });
        }
      }
      if (currentName) traits.push({ name: currentName, desc: currentDesc.trim(), isActive: false });
      if (traits.length === 0 && traitLines.length > 0) {
        traits.push({ name: b[1].trim() + ' Traits', desc: b[2].trim(), isActive: false });
      }
      sections.push({ title: b[1].trim(), traits });
    }

    // Also check for background section
    const bgMatch = text.match(/=== ([^=]+) — ([^=\n]+) ===\n([\s\S]*?)(?=\n===|$)/);
    if (bgMatch) {
      sections.push({
        title: `${bgMatch[1].trim()} (${bgMatch[2].trim()})`,
        traits: [{ name: bgMatch[2].trim(), desc: bgMatch[3].trim(), isActive: false }],
      });
    }

    return sections;
  }, [character.features_and_traits]);

  const filterButtons: { id: Filter; label: string }[] = [
    { id: 'all', label: 'ALL' },
    { id: 'class', label: 'CLASS FEATURES' },
    { id: 'species', label: 'SPECIES TRAITS' },
    { id: 'feats', label: 'FEATS' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
        {filterButtons.map(btn => (
          <button
            key={btn.id}
            onClick={() => setFilter(btn.id)}
            style={{
              padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
              letterSpacing: '0.08em', transition: 'all var(--tr-fast)',
              background: filter === btn.id ? 'var(--c-gold-l)' : 'var(--c-raised)',
              color: filter === btn.id ? '#000' : 'var(--t-2)',
              border: `1px solid ${filter === btn.id ? 'var(--c-gold-l)' : 'var(--c-border)'}`,
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* CLASS FEATURES — flat list */}
      {(filter === 'all' || filter === 'class') && (
        <div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: '#a78bfa', marginBottom: 12,
          }}>
            ✦ {character.class_name} Class Features
            {character.subclass && <span style={{ color: '#c084fc', marginLeft: 6, fontWeight: 400 }}>— {character.subclass}</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {classFeatures.map((feature, idx) => {
              const subclassFeats = feature.isSubclassFeature ? getSubclassFeatures(character, feature.level) : [];
              const choiceDisplay = getChoiceDisplay(feature.name, character, choices);
              const calc = getCalcNote(feature.name, character);
              const trackerCfg = getTrackerConfig(feature.name, character);
              const combatAbility = getCombatAbility(feature.name, character.class_name);
              const isPassive = PASSIVE_FEATURE_NAMES.has(feature.name) ||
                (feature.isSubclassFeature && subclassFeats.length === 0 && !character.subclass);
              const isASI = feature.isASI;

              return (
                <div
                  key={`${feature.name}-${idx}`}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--c-border)',
                  }}
                >
                  {/* Row: name + badges */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' as const }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14,
                        color: feature.isSubclassFeature ? '#c084fc' : 'var(--t-1)',
                      }}>
                        {feature.isSubclassFeature && subclassFeats.length > 0
                          ? subclassFeats.map(f => f.name).join(' & ')
                          : feature.name}
                      </span>
                      {feature.isSubclassFeature && character.subclass && (
                        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: '#c084fc', marginLeft: 6, opacity: 0.7 }}>
                          {character.subclass}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' as const }}>
                      {/* Level badge */}
                      <span style={{ fontSize: 9, color: 'var(--t-3)', fontFamily: 'var(--ff-body)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '1px 6px' }}>
                        Lv {feature.level}
                      </span>
                      {/* Action type badge */}
                      {combatAbility && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                          color: ACTION_COLORS[combatAbility.actionType],
                          background: ACTION_COLORS[combatAbility.actionType] + '18',
                          border: `1px solid ${ACTION_COLORS[combatAbility.actionType]}40`,
                          borderRadius: 999, padding: '1px 6px',
                        }}>
                          {combatAbility.actionType === 'bonus' ? 'Bonus Action'
                            : combatAbility.actionType === 'action' ? 'Action'
                            : combatAbility.actionType === 'reaction' ? 'Reaction'
                            : combatAbility.actionType === 'special' ? 'Special'
                            : 'Free'}
                        </span>
                      )}
                      {/* ACTIVE / PASSIVE badge */}
                      {isASI ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                          ASI / FEAT
                        </span>
                      ) : isPassive ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                          ✓ ACTIVE
                        </span>
                      ) : !combatAbility ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '1px 6px' }}>
                          PASSIVE
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Choice result */}
                  {choiceDisplay && (
                    <div style={{
                      marginTop: 5, padding: '4px 10px',
                      background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.2)',
                      borderRadius: 'var(--r-md)', display: 'inline-block',
                      fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--c-gold-l)', fontStyle: 'italic',
                    }}>
                      {choiceDisplay}
                    </div>
                  )}

                  {/* Subclass feature descriptions */}
                  {feature.isSubclassFeature && subclassFeats.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {subclassFeats.map((sf, i) => (
                        <div key={i} style={{
                          padding: '8px 12px',
                          background: sf.isChoice ? 'rgba(212,160,23,0.04)' : 'rgba(192,132,252,0.04)',
                          border: `1px solid ${sf.isChoice ? 'rgba(212,160,23,0.2)' : 'rgba(192,132,252,0.15)'}`,
                          borderRadius: 'var(--r-md)',
                        }}>
                          <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: sf.isChoice ? 'var(--c-gold-l)' : '#c084fc', marginBottom: 3 }}>
                            {sf.isChoice && '⬡ '}{sf.name}
                            {sf.isChoice && <span style={{ fontSize: 9, marginLeft: 6, fontWeight: 700, background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: 999, padding: '1px 5px' }}>CHOICE</span>}
                          </div>
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>{sf.description}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Class feature description (if not subclass or if no subclass data) */}
                  {(!feature.isSubclassFeature || subclassFeats.length === 0) && !choiceDisplay && (
                    <div style={{ marginTop: 4, fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>
                      {feature.description}
                    </div>
                  )}

                  {/* Calculated values */}
                  {calc && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                        color: 'var(--c-gold-l)', background: 'rgba(212,160,23,0.08)',
                        border: '1px solid rgba(212,160,23,0.2)',
                        borderRadius: 999, padding: '2px 8px',
                      }}>
                        {calc}
                      </span>
                    </div>
                  )}

                  {/* Use tracker */}
                  {trackerCfg && (
                    <UseTracker
                      featureKey={feature.name}
                      max={trackerCfg.max}
                      rest={trackerCfg.rest}
                      character={character}
                      onUpdate={onUpdate}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SPECIES & BACKGROUND TRAITS */}
      {(filter === 'all' || filter === 'species') && speciesSections.length > 0 && (
        <div style={{ marginTop: filter === 'all' ? 16 : 0 }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: '#34d399', marginBottom: 12,
          }}>
            🌿 Species & Background Traits
          </div>
          {speciesSections.map((section, si) => (
            <div key={si} style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: '#34d399', marginBottom: 8 }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {section.traits.map((trait, ti) => (
                  <div key={ti} style={{ padding: '8px 0', borderBottom: '1px solid var(--c-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' as const }}>
                      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>
                        {trait.name}
                      </span>
                      {trait.isActive && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                          ✓ ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
                      {trait.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FEATS */}
      {(filter === 'all' || filter === 'feats') && (
        <div style={{ marginTop: filter === 'all' ? 16 : 0 }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: 'var(--c-gold-l)', marginBottom: 12,
          }}>
            🏅 Feats
          </div>
          <FeatsPanel character={character} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}
