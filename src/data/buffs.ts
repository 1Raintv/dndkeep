import type { ActiveBuff } from '../types';

export const COMMON_BUFFS: Omit<ActiveBuff, 'id' | 'duration'>[] = [
  {
    name: 'Rage',
    icon: '🔥',
    color: '#ef4444',
    effects: ['Advantage on Strength checks and saves', '+2 damage on melee attacks', 'Resistance to B/P/S damage', "Can't cast or concentrate on spells"],
    attackBonus: 0,
    damageBonus: 2,
    advantages: ['strength'],
    resistances: ['bludgeoning', 'piercing', 'slashing'],
  },
  {
    name: 'Bless',
    icon: '✨',
    color: '#f59e0b',
    effects: ['Add 1d4 to attack rolls', 'Add 1d4 to saving throws'],
    attackBonus: 0, // handled as 1d4 roll
    saveBonus: 0,   // handled as 1d4 roll
  },
  {
    name: 'Bane',
    icon: '💀',
    color: '#6b7280',
    effects: ['Subtract 1d4 from attack rolls', 'Subtract 1d4 from saving throws'],
  },
  {
    name: 'Haste',
    icon: '⚡',
    color: '#60a5fa',
    effects: ['+2 AC', 'Advantage on Dexterity saves', 'Speed doubled', 'Extra action (Attack, Dash, Disengage, Hide, Use Object)'],
    acBonus: 2,
    speedBonus: 0, // doubled — handled specially
    advantages: ['dexterity'],
  },
  {
    name: 'Mage Armor',
    icon: '🛡️',
    color: '#8b5cf6',
    // v2.156.0 — Phase P pt 4: Mage Armor is RAW an OVERRIDE, not an
    // additive bonus. While the target is unarmored, AC becomes
    // 13 + Dex modifier. Wearing armor? Mage Armor has no effect.
    // The flat acBonus: 3 below only works cleanly for unarmored
    // wizards / sorcerers (base AC 10 + Dex → 13 + Dex). For a
    // character with 16 Dex wearing Studded Leather (AC 15 + Dex =
    // 18), applying +3 would incorrectly give 21. DM should remove
    // this buff when casting on armored targets.
    effects: ['AC = 13 + Dex modifier (only if unarmored — has no effect in armor)'],
    acBonus: 3,
  },
  {
    name: 'Shield of Faith',
    icon: '🔵',
    color: '#3b82f6',
    effects: ['+2 AC bonus'],
    acBonus: 2,
  },
  {
    // v2.156.0 — Phase P pt 4: Shield is a 1st-level reaction spell
    // (Sorcerer/Wizard). Cast in response to being hit or targeted
    // by Magic Missile — +5 AC until the start of your next turn,
    // and Magic Missile auto-misses. Applies retroactively to the
    // triggering attack — RAW the +5 can turn a hit into a miss.
    // Pure additive bonus, no override semantics, fits the acBonus
    // pipeline perfectly.
    name: 'Shield',
    icon: '🛡',
    color: '#38bdf8',
    effects: ['+5 AC until start of next turn', 'Auto-miss on all Magic Missiles this turn'],
    acBonus: 5,
  },
  {
    name: 'Bardic Inspiration',
    icon: '🎵',
    color: '#ec4899',
    effects: ['Add Bardic Inspiration die to one attack, check, or save (once, then gone)'],
  },
  {
    name: 'Hunter\'s Mark',
    icon: '🎯',
    color: '#f97316',
    effects: ['Add 1d6 damage to attacks against marked target', 'Advantage on Perception and Survival checks to track target'],
    damageBonus: 0, // 1d6 — handled per attack
  },
  {
    name: 'Hex',
    icon: '⬡',
    color: '#7c3aed',
    effects: ['Add 1d6 necrotic damage to attacks against hexed target', 'Disadvantage on chosen ability checks'],
    damageBonus: 0,
  },
  {
    name: 'Divine Favor',
    icon: '⭐',
    color: '#fbbf24',
    effects: ['Add 1d4 radiant damage to weapon attacks'],
    damageBonus: 0,
  },
  {
    name: 'Heroism',
    icon: '💪',
    color: '#f59e0b',
    effects: ['Immune to Frightened', 'Gain Cha mod temp HP at start of each turn'],
    immunities: ['frightened'],
  },
  {
    name: 'Mirror Image',
    icon: '🪞',
    color: '#94a3b8',
    effects: ['3 duplicates redirect attacks (roll d20; 6+ with 3, 8+ with 2, 11+ with 1 duplicate remaining)'],
  },
  {
    name: 'Blur',
    icon: '🌀',
    color: '#6366f1',
    effects: ['Attacks against you have disadvantage (unless attacker uses Blindsight, Truesight, or you are Invisible/Incapacitated)'],
    advantages: [], disadvantages: [],
  },
  {
    name: 'Aid',
    icon: '❤️',
    color: '#34d399',
    effects: ['+5 max HP and current HP for 8 hours'],
  },
  {
    name: 'Stoneskin',
    icon: '🪨',
    color: '#78716c',
    effects: ['Resistance to nonmagical Bludgeoning, Piercing, and Slashing damage'],
    resistances: ['bludgeoning', 'piercing', 'slashing'],
  },
  {
    name: 'Hallow (Magic Resistance)',
    icon: '🏛️',
    color: '#fbbf24',
    effects: ['Advantage on saves against spells and magical effects'],
    advantages: ['spell'],
  },
  {
    name: 'Protection from Evil',
    icon: '🔮',
    color: '#8b5cf6',
    effects: ['Advantage on saves against attacks from aberrations, celestials, elementals, fey, fiends, undead', 'Those creatures have disadvantage on attacks against you'],
    advantages: ['saves_against_evil'],
  },
  {
    name: 'Resistance (Spell)',
    icon: '💎',
    color: '#06b6d4',
    effects: ['Add 1d4 to one saving throw (once, then done)'],
  },
  {
    name: 'Reckless Attack',
    icon: '⚔️',
    color: '#ef4444',
    effects: ['Advantage on attack rolls this turn', 'Attacks against you have advantage until your next turn'],
    advantages: ['attack'],
    disadvantages: ['received_attacks'],
  },
  {
    name: 'Bonus Action Attack (Action Surge)',
    icon: '💥',
    color: '#f97316',
    effects: ['Extra action this turn (Fighter Action Surge)'],
  },
  {
    name: 'Invisible',
    icon: '👻',
    color: '#6366f1',
    effects: ['Attacks from you have advantage', 'Attacks against you have disadvantage'],
    advantages: ['attack'],
  },
  {
    name: 'Custom Buff',
    icon: '✦',
    color: '#64748b',
    effects: ['Custom effect — describe in notes'],
  },
];

export const BUFF_MAP: Record<string, typeof COMMON_BUFFS[0]> = Object.fromEntries(
  COMMON_BUFFS.map(b => [b.name, b])
);
