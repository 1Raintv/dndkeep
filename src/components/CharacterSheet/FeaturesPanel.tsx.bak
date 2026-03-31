import { useState } from 'react';
import type { Character } from '../../types';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';
import { CLASS_MAP } from '../../data/classes';
import { SPECIES_MAP } from '../../data/species';
import { BACKGROUND_MAP } from '../../data/backgrounds';

interface FeaturesPanelProps {
  character: Character;
}

interface FeatureCard {
  name: string;
  description: string;
  source: 'class' | 'subclass' | 'species' | 'background';
  level?: number;
}

const SOURCE_COLORS = {
  class:      { bg: 'rgba(201,146,42,0.08)',  border: 'var(--border-gold)',  badge: 'badge-gold',   label: 'Class' },
  subclass:   { bg: 'rgba(167,139,250,0.08)', border: '#a78bfa',             badge: 'badge-muted',  label: 'Subclass' },
  species:    { bg: 'rgba(52,211,153,0.08)',  border: '#34d399',             badge: 'badge-muted',  label: 'Species' },
  background: { bg: 'rgba(96,165,250,0.08)', border: '#60a5fa',             badge: 'badge-muted',  label: 'Background' },
};

function buildFeatureCards(character: Character): FeatureCard[] {
  const cards: FeatureCard[] = [];

  // Species traits
  const species = SPECIES_MAP[character.species];
  if (species) {
    for (const trait of species.traits) {
      cards.push({ name: trait.name, description: trait.description, source: 'species' });
    }
  }

  // Background feature
  const bg = BACKGROUND_MAP[character.background];
  if (bg) {
    cards.push({ name: bg.feature_name, description: bg.feature_description, source: 'background' });
  }

  // Class features from progression
  const progression = CLASS_LEVEL_PROGRESSION[character.class_name] ?? [];
  const cls = CLASS_MAP[character.class_name];
  const relevantLevels = progression.filter(m => m.level <= character.level);

  for (const milestone of relevantLevels) {
    for (const feat of milestone.features) {
      if (!feat.trim()) continue;
      cards.push({
        name: feat,
        description: getFeatureDescription(character.class_name, feat),
        source: 'class',
        level: milestone.level,
      });
    }

    // Subclass features at the subclass level and beyond
    if (milestone.subclassFeature && character.subclass && milestone.level >= 3) {
      cards.push({
        name: `${character.subclass} Feature`,
        description: `A feature granted by your ${character.subclass} subclass at level ${milestone.level}. Check the Player's Handbook for the full details.`,
        source: 'subclass',
        level: milestone.level,
      });
    }
  }

  return cards;
}

// Brief descriptions for common class features
function getFeatureDescription(className: string, featureName: string): string {
  const descs: Record<string, string> = {
    'Extra Attack': 'When you take the Attack action, you can make two attacks instead of one.',
    'Extra Attack (2 attacks)': 'When you take the Attack action, you can make two attacks instead of one.',
    'Extra Attack (3 attacks total)': 'When you take the Attack action, you can make three attacks instead of one.',
    'Extra Attack (4 attacks total)': 'When you take the Attack action, you can make four attacks instead of one.',
    'Unarmored Defense (DEX+WIS)': 'While you are not wearing armor, your Armor Class equals 10 + your Dexterity modifier + your Wisdom modifier.',
    'Unarmored Defense': 'While you are not wearing armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier.',
    'Spellcasting': 'You can cast spells drawn from your class spell list, using your class\'s spellcasting ability.',
    'Rage (2/Long Rest)': 'You can enter a rage as a bonus action, gaining advantage on Strength checks and saves, bonus damage, and resistance to bludgeoning, piercing, and slashing damage.',
    'Danger Sense': 'You have advantage on Dexterity saving throws against effects you can see, such as traps and spells, as long as you are not blinded, deafened, or incapacitated.',
    'Reckless Attack': 'You can choose to attack recklessly, giving you advantage on melee weapon attack rolls using Strength this turn. However, attack rolls against you have advantage until your next turn.',
    'Bardic Inspiration (CHA mod/Long Rest)': 'You can inspire others. A creature can use the die on one ability check, attack roll, or saving throw. The die is a d6, increasing at higher levels.',
    'Jack of All Trades': 'You can add half your proficiency bonus, rounded down, to any ability check that doesn\'t already include your proficiency bonus.',
    'Song of Rest': 'You can use soothing music or oration to help revitalize your wounded allies during a short rest. If you or any friendly creatures who can hear your performance regain HP by spending HD at the end of the short rest, each regains 1d6 extra HP.',
    'Cunning Action (Dash/Disengage/Hide as Bonus Action)': 'Your quick thinking and agility allow you to move and act quickly. You can take a bonus action on each of your turns to Dash, Disengage, or Hide.',
    'Sneak Attack (1d6)': 'Once per turn, you can deal an extra 1d6 damage to one creature you hit with an attack if you have advantage or an ally is within 5 feet of the creature.',
    'Evasion': 'Your instinctive agility lets you dodge out of the way of certain area effects. When you are subjected to an effect that allows a Dex save for half damage, you take no damage on a success, and half damage on a failure.',
    'Uncanny Dodge': 'When an attacker that you can see hits you with an attack, you can use your reaction to halve the attack\'s damage against you.',
    'Lay on Hands (5 HP pool/Long Rest)': 'You have a pool of healing power that replenishes when you take a long rest. With that pool, you can restore HP to creatures by touch, or expend 5 HP from the pool to cure one disease or neutralize one poison.',
    'Divine Sense': 'The presence of strong evil registers on your senses like a nauseous odor, and powerful good rings like heavenly music in your ears. You know the location of any celestial, fiend, or undead within 60 feet of you.',
    'Divine Smite (on hit: spend slot for radiant)': 'When you hit a creature with a melee weapon attack, you can expend one spell slot to deal radiant damage to the target, in addition to the weapon\'s damage.',
    'Aura of Protection (add CHA to all saves within 10 ft)': 'Whenever you or a friendly creature within 10 feet of you must make a saving throw, that creature gains a bonus equal to your Charisma modifier (minimum of +1).',
    'Second Wind (1d10+level/Short Rest)': 'You have a limited well of stamina. On your turn, you can use a bonus action to regain HP equal to 1d10 + your Fighter level. Once you use this feature, you must finish a short or long rest before using it again.',
    'Action Surge (1/Short Rest)': 'You can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action. You can use this feature once between rests.',
    'Indomitable (1/Long Rest)': 'You can reroll a saving throw that you fail. If you do so, you must use the new roll, and you can\'t use this feature again until you finish a long rest.',
    'Martial Arts (unarmed d4)': 'You can use Dexterity instead of Strength for unarmed strikes and monk weapons. Your unarmed strikes deal 1d4 bludgeoning damage. You can make an unarmed strike as a bonus action.',
    'Stillness of Mind': 'You can use your action to end one effect on yourself that is causing you to be charmed or frightened.',
    'Ki-Empowered Strikes': 'Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.',
    'Wild Shape (CR 1/4, no fly/swim)': 'You can use your action to magically assume the shape of a beast that you have seen before. You can use this feature twice, regaining expended uses when you finish a short or long rest.',
    'Druidic (secret language)': 'You know Druidic, the secret language of druids. You can speak the language and use it to leave hidden messages.',
    'Channel Divinity (1/Short Rest)': 'You gain the ability to channel divine energy directly from your deity, using that energy to fuel magical effects. When you use your Channel Divinity, you choose which effect to create.',
    'Turn Undead': 'As an action, you present your holy symbol and speak a prayer censuring the undead. Each undead that can see or hear you within 30 feet must make a Wisdom save. If the creature fails, it is turned for 1 minute.',
    'Innate Sorcery (1 min of advantage, 2/Long Rest)': 'As a bonus action, you can draw on and amplify your innate magic for 1 minute, gaining advantage on attack rolls for spells and imposing disadvantage on saves against your spells.',
    'Font of Magic': 'You can tap into a deep wellspring of magic within yourself. This wellspring is represented by sorcery points, which allow you to create a variety of magical effects.',
    'Pact Magic (1 slot, Short Rest recovery)': 'Your arcane research and the magic bestowed on you by your patron have given you facility with spells. You have spell slots that recover on a short or long rest.',
    'Eldritch Invocations (1)': 'In your study of occult lore, you have unearthed eldritch invocations, fragments of forbidden knowledge that imbue you with an abiding magical ability.',
    'Arcane Recovery (Short Rest: recover slots = half level)': 'You have learned to regain some of your magical energy by studying your spellbook. Once per day, you can recover spell slots with a combined level up to half your Wizard level, rounded up.',
    'Favored Enemy': 'You have significant experience studying, tracking, hunting, and even talking to a certain type of enemy. You have advantage on checks to track your favored enemies, and you gain intelligence on them.',
    'Weapon Mastery': 'Your training with weapons allows you to use the Mastery property of three kinds of weapons with which you have proficiency.',
    'Fast Movement (+10 ft)': 'Your speed increases by 10 feet while you aren\'t wearing heavy armor.',
    'Feral Instinct': 'Your instincts are so honed that you have advantage on initiative rolls. Additionally, if you are surprised at the beginning of combat and aren\'t incapacitated, you can act normally on your first turn.',
    'Relentless Rage': 'Your rage can keep you fighting despite grievous wounds. If you drop to 0 HP while raging and don\'t die outright, you can make a DC 10 Constitution save. On success, you drop to 1 HP instead.',
    'Persistent Rage': 'Your rage is so fierce that it ends early only if you fall unconscious or choose to end it.',
    'Primal Champion (+4 STR, +4 CON)': 'You embody the power of the wilds. Your Strength and Constitution scores increase by 4. Your maximum for those scores is now 24.',
    'Reliable Talent (min 10 on proficient checks)': 'By 11th level, you have refined your chosen skills until they approach perfection. Whenever you make an ability check that lets you add your proficiency bonus, you can treat a d20 roll of 9 or lower as a 10.',
    'Slippery Mind (proficiency in WIS + CHA saves)': 'You have acquired greater mental strength. You gain proficiency in Wisdom saving throws and Charisma saving throws.',
    'Elusive (attacks never have advantage vs you)': 'You are so evasive that attackers rarely gain the upper hand against you. No attack roll has advantage against you while you aren\'t incapacitated.',
    'Stroke of Luck (turn miss to hit / failed check to 20, 1/Short Rest)': 'You have an uncanny knack for succeeding when you need to. If your attack misses a target within range, you can turn the miss into a hit. Alternatively, if you fail an ability check, you can treat the d20 roll as a 20.',
  };
  return descs[featureName] ?? `A ${className} class feature gained at level ${featureName}. Refer to the Player's Handbook for the full description.`;
}

export default function FeaturesPanel({ character }: FeaturesPanelProps) {
  const [filter, setFilter] = useState<'all' | 'class' | 'subclass' | 'species' | 'background'>('all');
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const allCards = buildFeatureCards(character);
  const displayed = filter === 'all' ? allCards : allCards.filter(c => c.source === filter);

  const counts = {
    class:      allCards.filter(c => c.source === 'class').length,
    subclass:   allCards.filter(c => c.source === 'subclass').length,
    species:    allCards.filter(c => c.source === 'species').length,
    background: allCards.filter(c => c.source === 'background').length,
  };

  return (
    <section>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {(['all', 'class', 'subclass', 'species', 'background'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '4px 12px', borderRadius: 'var(--radius-md)',
              border: filter === f ? '1px solid var(--color-gold)' : '1px solid var(--border-subtle)',
              background: filter === f ? 'rgba(201,146,42,0.12)' : 'var(--bg-sunken)',
              color: filter === f ? 'var(--text-gold)' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all var(--transition-fast)',
            }}
          >
            {f === 'all' ? `All (${allCards.length})` : `${f} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Feature cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {displayed.map((card, i) => {
          const key = `${card.source}-${card.name}-${i}`;
          const isExpanded = expandedName === key;
          const style = SOURCE_COLORS[card.source];
          return (
            <div
              key={key}
              onClick={() => setExpandedName(isExpanded ? null : key)}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isExpanded ? style.border : 'var(--border-subtle)'}`,
                background: isExpanded ? style.bg : 'var(--bg-surface)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: isExpanded ? 'var(--text-gold)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card.name}
                  </span>
                  {card.level && (
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      Lvl {card.level}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                  <span className={`badge ${style.badge}`} style={{ fontSize: 9 }}>
                    {SOURCE_COLORS[card.source].label}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, userSelect: 'text' }}>
                  {card.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {displayed.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>
            No features from this source.
          </p>
        </div>
      )}

      <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
        Click any feature to expand its description. Subclass features require the Player's Handbook for full detail.
      </p>
    </section>
  );
}
