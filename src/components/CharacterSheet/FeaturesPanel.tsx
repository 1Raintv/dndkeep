import { useState } from 'react';
import type { Character } from '../../types';
import { getFeaturesForLevel, getSneakAttackDice, getMartialArtsDie, getBardicInspirationDie, type ClassFeature } from '../../data/classFeatures';

interface FeaturesPanelProps {
  character: Character;
  onUpdateNotes?: (notes: string) => void;
}

const FEATURE_ICONS: Record<string, string> = {
  'Rage': '🔥', 'Extra Attack': '⚔️', 'Action Surge': '⚡', 'Second Wind': '💨',
  'Sneak Attack': '🗡️', 'Bardic Inspiration': '🎵', 'Spellcasting': '✨',
  'Channel Divinity': '✝️', 'Wild Shape': '🐾', 'Stunning Strike': '☯️',
  'Lay on Hands': '🤲', 'Aura of Protection': '🛡️', 'Cunning Action': '👟',
  'Evasion': '💨', 'Unarmored Defense': '🥋', 'Eldritch Invocations': '👿',
  'Pact Magic': '📜', 'Font of Magic': '✨', 'Arcane Recovery': '📚',
  'Favored Enemy': '🎯', 'Expertise': '⭐', 'Fighting Style': '⚔️',
  'Subclass Feature': '🌟', 'Ability Score Improvement': '📈',
  'Mystic Arcanum': '🔮', 'Metamagic': '💫', 'Eldritch Master': '👿',
};

function getIcon(name: string): string {
  for (const [key, icon] of Object.entries(FEATURE_ICONS)) {
    if (name.includes(key)) return icon;
  }
  return '📖';
}

export default function FeaturesPanel({ character, onUpdateNotes }: FeaturesPanelProps) {
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<'class' | 'notes'>('class');
  const [notes, setNotes] = useState(character.features_text ?? '');

  const autoFeatures = getFeaturesForLevel(character.class_name, character.level);

  function getDescription(feature: ClassFeature): string {
    let desc = feature.description;
    const level = character.level;
    const cha = Math.floor((character.charisma - 10) / 2);
    const wis = Math.floor((character.wisdom - 10) / 2);

    if (feature.name.includes('Bardic Inspiration')) {
      const die = getBardicInspirationDie(level);
      const uses = Math.max(1, cha);
      desc = desc.replace(/d\d+/, die);
      desc += ` [Current: ${die}, ${uses} use${uses !== 1 ? 's' : ''}/rest]`;
    }
    if (feature.name === 'Sneak Attack') {
      desc += ` [Current: ${getSneakAttackDice(level)}]`;
    }
    if (feature.name === 'Martial Arts' || feature.name.includes('Martial Arts')) {
      desc += ` [Current die: ${getMartialArtsDie(level)}]`;
    }
    if (feature.name === 'Lay on Hands') {
      desc += ` [Current pool: ${level * 5} HP]`;
    }
    if (feature.name === 'Aura of Protection') {
      desc += ` [Current: +${Math.max(1, cha)} to all saves]`;
    }
    if (feature.name === 'Rage' && !feature.name.includes('Relentless')) {
      const rageBonus = level >= 16 ? 4 : level >= 9 ? 3 : 2;
      desc += ` [Damage bonus: +${rageBonus}]`;
    }
    if (feature.name.includes('Monk\'s Focus') || feature.name === 'Ki Points') {
      desc += ` [Current: ${level} ki points]`;
    }
    if (feature.name.includes('Unarmored Movement')) {
      const bonus = level >= 18 ? 30 : level >= 14 ? 25 : level >= 10 ? 20 : level >= 6 ? 15 : 10;
      desc += ` [Current: +${bonus} ft]`;
    }
    if (feature.name === 'Abjure Foes') {
      desc += ` [Wis save DC ${8 + Math.floor(level / 2) + Math.max(0, wis)}]`;
    }
    return desc;
  }

  const grouped: Record<string, ClassFeature[]> = {};
  for (const f of autoFeatures) {
    const key = String(f.level);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  }

  const levels = Object.keys(grouped).map(Number).sort((a, b) => a - b);
  const displayLevels = showAll ? levels : levels.filter(l => l >= Math.max(1, character.level - 2));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        {(['class', 'notes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '4px var(--sp-4)', borderRadius: 999,
              border: `1px solid ${tab === t ? 'var(--c-gold)' : 'var(--c-border)'}`,
              background: tab === t ? 'rgba(212,160,23,0.12)' : 'transparent',
              color: tab === t ? 'var(--c-gold-l)' : 'var(--t-2)',
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer',
            }}>
            {t === 'class' ? '⚔️ Class Features' : '📝 Notes'}
          </button>
        ))}
      </div>

      {tab === 'class' && (
        <>
          <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 'var(--r-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>
                {character.class_name} {character.level}
                {character.subclass ? ` — ${character.subclass}` : ''}
                {character.secondary_class && (character.secondary_level ?? 0) > 0 ? ` / ${character.secondary_class} ${character.secondary_level}` : ''}
              </div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 2 }}>
                {autoFeatures.length} features unlocked
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setShowAll(v => !v)} style={{ fontSize: 'var(--fs-xs)' }}>
              {showAll ? 'Recent Only' : 'All Levels'}
            </button>
          </div>

          {displayLevels.map(level => (
            <div key={level}>
              <div className="section-header">Level {level}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                {grouped[String(level)].map(feature => {
                  const key = `${level}-${feature.name}`;
                  const isOpen = expandedFeature === key;
                  const borderColor = feature.isSubclassFeature ? 'rgba(91,63,168,0.3)' : feature.isASI ? 'rgba(52,211,153,0.2)' : 'var(--c-border)';
                  const bgColor = feature.isSubclassFeature ? 'rgba(91,63,168,0.05)' : '#080d14';
                  const nameColor = feature.isSubclassFeature ? 'var(--c-purple-l)' : feature.isASI ? 'var(--hp-full)' : 'var(--t-1)';

                  return (
                    <div key={key} style={{ border: `1px solid ${borderColor}`, borderRadius: 'var(--r-md)', background: bgColor, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)', cursor: 'pointer' }}
                        onClick={() => setExpandedFeature(isOpen ? null : key)}>
                        <span style={{ fontSize: 15, flexShrink: 0 }}>{getIcon(feature.name)}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)', color: nameColor }}>
                            {feature.name}
                          </span>
                          {feature.isSubclassFeature && character.subclass && (
                            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-purple-l)', background: 'rgba(91,63,168,0.15)', border: '1px solid rgba(91,63,168,0.3)', padding: '1px 5px', borderRadius: 999, marginLeft: 6 }}>
                              {character.subclass}
                            </span>
                          )}
                        </div>
                        <span style={{ color: 'var(--t-2)', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                      {isOpen && (
                        <div className="animate-fade-in" style={{ padding: 'var(--sp-2) var(--sp-3) var(--sp-3)', borderTop: '1px solid var(--c-border)' }}>
                          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.65, margin: 0 }}>
                            {getDescription(feature)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {!showAll && levels.length > displayLevels.length && (
            <button className="btn-secondary btn-sm" onClick={() => setShowAll(true)} style={{ alignSelf: 'center' }}>
              Show all {levels.length} levels
            </button>
          )}

          {autoFeatures.length === 0 && (
            <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
              No feature data for {character.class_name}.
            </div>
          )}
        </>
      )}

      {tab === 'notes' && (
        <div>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)' }}>
            Record specific choices — fighting style, maneuver selections, invocations, etc.
          </p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => onUpdateNotes?.(notes)}
            rows={14}
            placeholder={`Fighting Style: Dueling (+2 damage one-handed)
Subclass: ${character.subclass || 'Battle Master'}
  - Maneuvers: Riposte, Precision Attack
  - Superiority Dice: ${Math.max(4, 4 + Math.floor((character.level - 3) / 4))}d8

Background abilities, tool proficiencies, languages...`}
            style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.7, resize: 'vertical' }}
          />
        </div>
      )}
    </div>
  );
}
