import { useState, useMemo } from 'react';
import type { Character } from '../../types';
import { CLASS_FEATURES, getFeaturesForLevel } from '../../data/classFeatures';
import { CLASS_MAP } from '../../data/classes';
import FeatsPanel from './FeatsPanel';

interface Props {
  character: Character;
  onUpdate: (u: Partial<Character>) => void;
}

type Filter = 'all' | 'class' | 'species' | 'feats';

// Features that have limited uses — key is feature name substring, value is rest type
const LIMITED_USE_FEATURES: Record<string, { rest: 'short' | 'long', maxFn?: (c: Character) => number }> = {
  'Rage':                  { rest: 'long',  maxFn: c => c.level >= 20 ? 999 : c.level >= 17 ? 6 : c.level >= 12 ? 5 : c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2 },
  'Wild Shape':            { rest: 'short', maxFn: _c => 2 },
  'Action Surge':          { rest: 'short', maxFn: c => c.level >= 17 ? 2 : 1 },
  'Second Wind':           { rest: 'short', maxFn: _c => 1 },
  'Bardic Inspiration':    { rest: 'short', maxFn: c => Math.max(1, Math.floor((c.charisma - 10) / 2)) },
  'Channel Divinity':      { rest: 'short', maxFn: c => c.level >= 18 ? 3 : c.level >= 6 ? 2 : 1 },
  'Divine Sense':          { rest: 'long',  maxFn: c => Math.max(1, 1 + Math.floor((c.charisma - 10) / 2)) },
  'Lay on Hands':          { rest: 'long',  maxFn: _c => undefined }, // pool, not charges
  'Wholeness of Body':     { rest: 'long',  maxFn: _c => 1 },
  'Hurl Through Hell':     { rest: 'long',  maxFn: _c => 1 },
  'Eldritch Master':       { rest: 'long',  maxFn: _c => 1 },
  'Mystic Arcanum':        { rest: 'long',  maxFn: _c => 1 },
  'Tides of Chaos':        { rest: 'long',  maxFn: _c => 1 },
  'Magical Cunning':       { rest: 'long',  maxFn: _c => 1 },
  'Contact Patron':        { rest: 'long',  maxFn: _c => 1 },
  'Searing Vengeance':     { rest: 'long',  maxFn: _c => 1 },
  "Dark One's Own Luck":   { rest: 'long',  maxFn: c => Math.max(1, Math.floor((c.proficiency_bonus ?? 2))) },
};

// Parse choice sections from features_and_traits
function parseChoices(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const sections = text.split(/\n\n(?=\[)/);
  for (const section of sections) {
    const m = section.match(/^\[([^\]]+)\]\n([\s\S]*)$/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  // Also parse species/background blocks
  const speciesMatch = text.match(/=== ([^=]+) (?:Traits|Features) ===\n([\s\S]*?)(?=\n===|\n\[|$)/g);
  if (speciesMatch) {
    for (const block of speciesMatch) {
      const bm = block.match(/=== ([^=]+) (?:Traits|Features) ===\n([\s\S]*)/);
      if (bm) result[`__species_${bm[1].trim()}`] = bm[2].trim();
    }
  }
  return result;
}

// Get the display name for a subclass feature based on class/subclass data
function getSubclassFeatureName(character: Character, featureLevel: number): string | null {
  const classData = CLASS_MAP[character.class_name];
  if (!classData || !character.subclass) return null;
  const subcls = classData.subclasses?.find(s => s.name === character.subclass);
  if (!subcls?.features) return null;
  const feats = subcls.features.filter(f => f.level === featureLevel);
  return feats.map(f => f.name).join(', ') || null;
}

function getSubclassFeatures(character: Character, featureLevel: number) {
  const classData = CLASS_MAP[character.class_name];
  if (!classData || !character.subclass) return [];
  const subcls = classData.subclasses?.find(s => s.name === character.subclass);
  return subcls?.features?.filter(f => f.level === featureLevel) ?? [];
}

// Use tracker component
function UseTracker({ featureKey, max, rest, character, onUpdate }: {
  featureKey: string;
  max: number;
  rest: 'short' | 'long';
  character: Character;
  onUpdate: (u: Partial<Character>) => void;
}) {
  const uses = (character.feature_uses as Record<string, number> ?? {})[featureKey] ?? 0;
  const remaining = max - uses;

  function toggle(idx: number) {
    const current = (character.feature_uses as Record<string, number> ?? {})[featureKey] ?? 0;
    const newUsed = idx < current ? idx : idx + 1;
    onUpdate({
      feature_uses: { ...(character.feature_uses as Record<string, number> ?? {}), [featureKey]: Math.min(max, Math.max(0, newUsed)) }
    });
  }

  if (max > 6) {
    // Show as number for large pools
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <button onClick={() => toggle(Math.max(0, uses - 1) - 1)} style={btnStyle}>−</button>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-1)', minWidth: 60, textAlign: 'center' as const }}>
          {remaining} / {max}
        </span>
        <button onClick={() => toggle(uses)} style={btnStyle}>+</button>
        <span style={{ fontSize: 10, color: rest === 'short' ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--ff-body)' }}>
          {rest === 'short' ? 'Short/Long Rest' : 'Long Rest'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          onClick={() => toggle(i)}
          title={i < uses ? 'Click to restore' : 'Click to use'}
          style={{
            width: 18, height: 18, borderRadius: 3, cursor: 'pointer',
            background: i < uses ? 'transparent' : 'var(--c-gold-l)',
            border: `2px solid ${i < uses ? 'var(--c-border-m)' : 'var(--c-gold-l)'}`,
            transition: 'all 0.15s',
            padding: 0,
          }}
        />
      ))}
      <span style={{ fontSize: 10, color: rest === 'short' ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--ff-body)', marginLeft: 2 }}>
        / {rest === 'short' ? 'Short Rest' : 'Long Rest'}
      </span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 'var(--r-sm)',
  background: 'var(--c-raised)', border: '1px solid var(--c-border)',
  color: 'var(--t-1)', cursor: 'pointer', fontSize: 14, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

// A single feature card
function FeatureCard({
  name, level, description, isSubclass, choice, useKey, useMax, useRest, character, onUpdate, subclassFeatures
}: {
  name: string;
  level: number;
  description: string;
  isSubclass?: boolean;
  choice?: string;
  useKey?: string;
  useMax?: number;
  useRest?: 'short' | 'long';
  character: Character;
  onUpdate: (u: Partial<Character>) => void;
  subclassFeatures?: { name: string; description: string; isChoice?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const accentColor = isSubclass ? '#c084fc' : 'var(--t-1)';

  return (
    <div style={{
      borderBottom: '1px solid var(--c-border)',
      paddingBottom: 12, marginBottom: 4,
    }}>
      {/* Feature name + level */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', width: '100%', padding: 0,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: accentColor }}>
            {isSubclass && character.subclass
              ? (subclassFeatures && subclassFeatures.length > 0 ? subclassFeatures.map(f => f.name).join(' & ') : name)
              : name}
          </span>
          {isSubclass && character.subclass && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: '#c084fc', marginLeft: 6, opacity: 0.8 }}>
              {character.subclass}
            </span>
          )}
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', marginLeft: 8 }}>
            Lv {level}
          </span>
        </div>
        <span style={{ color: 'var(--t-3)', fontSize: 10, marginTop: 2, flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Collapsed: show brief summary */}
      {!open && (
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)', marginTop: 2, lineHeight: 1.4 }}>
          {choice
            ? <span style={{ color: 'var(--c-gold-l)', fontStyle: 'italic' }}>{choice}</span>
            : isSubclass && subclassFeatures?.length
              ? <span style={{ color: 'var(--t-3)' }}>{subclassFeatures.map(f => f.name).join(', ')}</span>
              : description.slice(0, 80) + (description.length > 80 ? '…' : '')}
        </div>
      )}

      {/* Expanded: full content */}
      {open && (
        <div style={{ marginTop: 8 }}>
          {/* Choice result block */}
          {choice && (
            <div style={{
              padding: '6px 12px', background: 'rgba(212,160,23,0.06)',
              border: '1px solid rgba(212,160,23,0.2)', borderRadius: 'var(--r-md)',
              fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--c-gold-l)',
              marginBottom: 8, fontStyle: 'italic',
            }}>
              {choice}
            </div>
          )}

          {/* Subclass feature descriptions */}
          {isSubclass && subclassFeatures && subclassFeatures.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {subclassFeatures.map((sf, i) => (
                <div key={i} style={{
                  padding: '8px 12px',
                  background: sf.isChoice ? 'rgba(212,160,23,0.04)' : 'rgba(192,132,252,0.04)',
                  border: `1px solid ${sf.isChoice ? 'rgba(212,160,23,0.2)' : 'rgba(192,132,252,0.15)'}`,
                  borderRadius: 'var(--r-md)',
                }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: sf.isChoice ? 'var(--c-gold-l)' : '#c084fc', marginBottom: 4 }}>
                    {sf.isChoice && '⬡ '}{sf.name}
                    {sf.isChoice && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', marginLeft: 6, background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: 999, padding: '1px 5px', color: 'var(--c-gold-l)' }}>CHOICE</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>
                    {sf.description}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.65 }}>
              {description}
            </div>
          )}

          {/* Use tracker */}
          {useKey && useMax !== undefined && useRest && (
            <UseTracker
              featureKey={useKey}
              max={useMax}
              rest={useRest}
              character={character}
              onUpdate={onUpdate}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function FeaturesAndTraitsPanel({ character, onUpdate }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const choices = useMemo(
    () => parseChoices(character.features_and_traits ?? ''),
    [character.features_and_traits]
  );

  const cha = Math.floor((character.charisma - 10) / 2);
  const prof = character.proficiency_bonus ?? 2;

  // Build the class features list up to character level
  const classFeatures = useMemo(() => {
    const allFeatures = CLASS_FEATURES[character.class_name] ?? [];
    return allFeatures.filter(f => f.level <= character.level);
  }, [character.class_name, character.level]);

  // Parse species traits from features_and_traits
  const speciesSections = useMemo(() => {
    const text = character.features_and_traits ?? '';
    const sections: { title: string; content: string }[] = [];
    // Match === Species Traits === blocks
    const matches = [...text.matchAll(/=== (.+?) (?:Traits|Features) ===\n([\s\S]*?)(?=\n===|$)/g)];
    for (const m of matches) {
      sections.push({ title: m[1].trim(), content: m[2].trim() });
    }
    // Also match background section
    const bgMatch = text.match(/=== (.+?) — (.+?) ===\n([\s\S]*?)(?=\n===|$)/);
    if (bgMatch) sections.push({ title: bgMatch[2], content: bgMatch[3].trim() });
    return sections;
  }, [character.features_and_traits]);

  // Calculated values for features
  function getCalculatedNote(featureName: string): string {
    const level = character.level;
    if (featureName === 'Bardic Inspiration') {
      const die = level >= 15 ? 'd12' : level >= 10 ? 'd10' : level >= 5 ? 'd8' : 'd6';
      return `${die} die • ${Math.max(1, cha)} use${Math.max(1, cha) !== 1 ? 's' : ''}/rest`;
    }
    if (featureName === 'Pact Magic') {
      const dc = 8 + prof + cha;
      const atk = prof + cha;
      return `Spell DC ${dc} • Spell Attack +${atk}`;
    }
    if (featureName === 'Spellcasting') {
      const mod = character.class_name === 'Wizard' || character.class_name === 'Artificer'
        ? Math.floor((character.intelligence - 10) / 2)
        : character.class_name === 'Cleric' || character.class_name === 'Druid' || character.class_name === 'Ranger' || character.class_name === 'Monk'
          ? Math.floor((character.wisdom - 10) / 2)
          : cha;
      const dc = 8 + prof + mod;
      const atk = prof + mod;
      return `Spell DC ${dc} • Spell Attack +${atk}`;
    }
    if (featureName === 'Lay on Hands') return `Pool: ${level * 5} HP`;
    if (featureName === 'Sneak Attack') {
      const dice = Math.ceil(level / 2);
      return `${dice}d6 extra damage`;
    }
    if (featureName === 'Rage') {
      const bonus = level >= 16 ? 4 : level >= 9 ? 3 : 2;
      const uses = level >= 20 ? '∞' : level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2;
      return `+${bonus} damage • ${uses} uses/rest`;
    }
    if (featureName === 'Unarmored Defense' && character.class_name === 'Barbarian') {
      const con = Math.floor((character.constitution - 10) / 2);
      const dex = Math.floor((character.dexterity - 10) / 2);
      return `AC = 10 + ${dex >= 0 ? '+' : ''}${dex} (Dex) + ${con >= 0 ? '+' : ''}${con} (Con)`;
    }
    if (featureName === 'Aura of Protection') return `+${Math.max(1, cha)} to all saves in 10 ft`;
    if (featureName.includes('Martial Arts')) {
      const die = level >= 17 ? 'd12' : level >= 11 ? 'd10' : level >= 5 ? 'd8' : 'd6';
      return `${die} unarmed strikes`;
    }
    if (featureName === 'Ki Points' || featureName.includes("Monk's Focus")) return `${level} points/rest`;
    if (featureName === 'Sorcery Points') return `${level} points/rest`;
    if (featureName === 'Healing Light') return `${1 + level}d6 pool/rest`;
    if (featureName === "Dark One's Blessing") return `${cha + level} temp HP on kill`;
    return '';
  }

  // Get choice display for a feature
  function getChoiceDisplay(featureName: string): string {
    const fn = featureName.toLowerCase();
    if (fn.includes('patron') || fn.includes('subclass') || fn.includes('otherworldly')) {
      return character.subclass ? character.subclass : '';
    }
    if (fn.includes('pact boon') || fn === 'pact boon') {
      return choices['Pact Boon'] ?? '';
    }
    if (fn.includes('eldritch invocation')) {
      return choices['Eldritch Invocations'] ?? '';
    }
    if (fn.includes('fighting style')) {
      return choices['Fighting Style'] ?? '';
    }
    if (fn.includes('metamagic')) {
      return choices['Metamagic'] ?? '';
    }
    if (fn.includes('divine order')) return choices['Divine Order'] ?? '';
    if (fn.includes('primal order')) return choices['Primal Order'] ?? '';
    if (fn.includes('expertise')) return choices['Expertise'] ?? '';
    if (fn.includes('mystic arcanum (6th)')) return choices['Mystic Arcanum 6th'] ?? '';
    if (fn.includes('mystic arcanum (7th)')) return choices['Mystic Arcanum 7th'] ?? '';
    if (fn.includes('mystic arcanum (8th)')) return choices['Mystic Arcanum 8th'] ?? '';
    if (fn.includes('mystic arcanum (9th)')) return choices['Mystic Arcanum 9th'] ?? '';
    return '';
  }

  // Get use tracker config for a feature
  function getUseConfig(featureName: string): { key: string; max: number; rest: 'short' | 'long' } | null {
    for (const [key, cfg] of Object.entries(LIMITED_USE_FEATURES)) {
      if (featureName.includes(key)) {
        const max = cfg.maxFn ? cfg.maxFn(character) : 1;
        if (max === undefined) return null; // pool type, skip
        return { key: featureName, max, rest: cfg.rest };
      }
    }
    return null;
  }

  const filterButtons: { id: Filter; label: string }[] = [
    { id: 'all', label: 'ALL' },
    { id: 'class', label: 'CLASS FEATURES' },
    { id: 'species', label: 'SPECIES TRAITS' },
    { id: 'feats', label: 'FEATS' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Filter tabs */}
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

      {/* CLASS FEATURES */}
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

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {classFeatures.map((feature, i) => {
              const choiceDisplay = getChoiceDisplay(feature.name);
              const calc = getCalculatedNote(feature.name);
              const useConfig = getUseConfig(feature.name);
              const subclassFeats = feature.isSubclassFeature
                ? getSubclassFeatures(character, feature.level)
                : [];

              let desc = feature.description;
              if (calc) desc = `${desc} [${calc}]`;

              return (
                <FeatureCard
                  key={`${feature.name}-${i}`}
                  name={feature.name}
                  level={feature.level}
                  description={desc}
                  isSubclass={feature.isSubclassFeature}
                  choice={choiceDisplay || undefined}
                  useKey={useConfig?.key}
                  useMax={useConfig?.max}
                  useRest={useConfig?.rest}
                  character={character}
                  onUpdate={onUpdate}
                  subclassFeatures={subclassFeats.length > 0 ? subclassFeats : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* SPECIES TRAITS */}
      {(filter === 'all' || filter === 'species') && speciesSections.length > 0 && (
        <div style={{ marginTop: filter === 'all' ? 8 : 0 }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: '#34d399', marginBottom: 12,
          }}>
            🌿 Species & Background Traits
          </div>
          {speciesSections.map((section, i) => (
            <div key={i} style={{
              borderBottom: '1px solid var(--c-border)', paddingBottom: 12, marginBottom: 4,
            }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: '#34d399', marginBottom: 4 }}>
                {section.title}
              </div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.65, whiteSpace: 'pre-wrap' as const }}>
                {section.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FEATS */}
      {(filter === 'all' || filter === 'feats') && (
        <div style={{ marginTop: filter === 'all' ? 8 : 0 }}>
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
