/**
 * Psion Psionic Disciplines — UA 2025 v2
 * Disciplines are chosen at level 2 and additional ones at 5, 10, 13, 17.
 * Each discipline grants a passive benefit or an active ability powered by Psionic Energy Dice.
 *
 * Discipline count per Psion level:
 *   lv 2  → 2 disciplines
 *   lv 5  → 3 disciplines
 *   lv 10 → 4 disciplines
 *   lv 13 → 5 disciplines
 *   lv 17 → 6 disciplines
 *
 * v2 changes from v1:
 *   - Swift Precognition renamed → Bolstering Precognition (now bonus to next D20 Test)
 *   - Tactical Mind renamed → Observant Mind
 *   - Sharpened Mind added (new discipline)
 *   - Ego Whip removed from disciplines (now exists as a level-2 spell)
 *   - Biofeedback / Destructive Thoughts now flexible: expend up to INT mod dice
 *   - Devilish Tongue / Expanded Awareness / Observant Mind only expend the die on a success
 */

export interface PsionDiscipline {
  id: string;
  name: string;
  type: 'passive' | 'active' | 'both';
  description: string;
  /** Cost in Psionic Energy Dice (if active) */
  dieCost?: string;
  /** Action type (if active) */
  actionType?: 'action' | 'bonus' | 'reaction' | 'free';
}

export const PSION_DISCIPLINES: PsionDiscipline[] = [
  {
    id: 'biofeedback',
    name: 'Biofeedback',
    type: 'active',
    actionType: 'free',
    dieCost: 'up to INT mod dice',
    description: 'When you cast a Psion spell from the Necromancy or Transmutation school, you can expend a number of Psionic Energy Dice up to your Intelligence modifier, roll them, and gain Temporary Hit Points equal to the total + your Intelligence modifier (minimum 1).',
  },
  {
    id: 'bolstering-precognition',
    name: 'Bolstering Precognition',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die',
    description: 'When you cast a Psion spell from the Abjuration or Divination school, you can expend 1 Psionic Energy Die. Roll the die and choose a creature you can see within 60 feet (which can be yourself). Until the end of your next turn, the creature gains a bonus to the next D20 Test it makes equal to the number rolled.',
  },
  {
    id: 'destructive-thoughts',
    name: 'Destructive Thoughts',
    type: 'active',
    actionType: 'free',
    dieCost: 'up to INT mod dice',
    description: 'When you cast a Psion spell from the Conjuration or Evocation school that forces a creature you can see to make a saving throw against the spell, you can expend a number of Psionic Energy Dice up to your Intelligence modifier and roll them. The creature takes Psychic damage equal to the total + your Intelligence modifier (minimum 1), regardless of the result of the saving throw.',
  },
  {
    id: 'devilish-tongue',
    name: 'Devilish Tongue',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die (expended only on success)',
    description: 'When you take the Influence action, you can roll 1 Psionic Energy Die and add the number rolled to the ability check. The die is expended only if this causes you to succeed on the check.',
  },
  {
    id: 'expanded-awareness',
    name: 'Expanded Awareness',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die (expended only on success)',
    description: 'When you take the Search action, you can roll 1 Psionic Energy Die and add the number rolled to the ability check. The die is expended only if this causes you to succeed on the check.',
  },
  {
    id: 'id-insinuation',
    name: 'Id Insinuation',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die',
    description: 'When you cast a Psion spell from the Enchantment or Illusion school that forces a creature to make a saving throw, you can expend 1 Psionic Energy Die and roll it. One target of the spell you can see subtracts half the number rolled (round up) from its saving throw against the spell.',
  },
  {
    id: 'inerrant-aim',
    name: 'Inerrant Aim',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die (expended only on hit)',
    description: 'When you make an attack roll against a creature and miss, you can roll 1 Psionic Energy Die and add the number rolled to the attack roll. The die is expended only if this causes the attack to hit.',
  },
  {
    id: 'observant-mind',
    name: 'Observant Mind',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die (expended only on success)',
    description: 'When you take the Study action, you can roll 1 Psionic Energy Die and add the number rolled to the ability check. The die is expended only if this causes you to succeed on the check.',
  },
  {
    id: 'psionic-backlash',
    name: 'Psionic Backlash',
    type: 'active',
    actionType: 'reaction',
    dieCost: '1 die',
    description: 'Immediately after a creature you can see hits you with an attack roll, you can take a Reaction to expend 1 Psionic Energy Die, roll it, and reduce the damage taken by 2× the number rolled + your Intelligence modifier (minimum 2). You can also force the attacker to make a Wisdom saving throw. On a failed save, the target takes Psychic damage equal to the amount you reduced.',
  },
  {
    id: 'psionic-guards',
    name: 'Psionic Guards',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die',
    description: 'At the start of your turn, you can expend 1 Psionic Energy Die. Until the start of your next turn, you have Immunity to the Charmed and Frightened conditions and Advantage on Intelligence saving throws. If you are Charmed or Frightened when you use this discipline, the condition ends on you. When you use Psionic Guards, you can also use a different Psionic Discipline this turn.',
  },
  {
    id: 'sharpened-mind',
    name: 'Sharpened Mind',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die',
    description: 'At the start of your turn, you can expend 1 Psionic Energy Die to hone your destructive psionics. Roll the die and record the number rolled. For 1 minute or until you have the Incapacitated condition, you gain: (1) Bypassing Psionics — damage from your weapon attacks, Psion spells, and Psion features ignores Resistance to Psychic damage; (2) Attack Mode — once per turn, when you deal Psychic damage to one or more creatures, you can replace the number rolled on one of the damage dice with the number recorded when you activated this discipline. When you use Sharpened Mind, you can also use a different Psionic Discipline this turn.',
  },
];

/** Get disciplines available at a given Psion level — all disciplines available from level 2 onward */
export function getAvailableDisciplines(_psionLevel: number): PsionDiscipline[] {
  return PSION_DISCIPLINES;
}

/** Get the number of disciplines a Psion has at a given level (UA 2025 v2 progression) */
export function getDisciplineCount(psionLevel: number): number {
  if (psionLevel >= 17) return 6;
  if (psionLevel >= 13) return 5;
  if (psionLevel >= 10) return 4;
  if (psionLevel >= 5) return 3;
  if (psionLevel >= 2) return 2;
  return 0;
}
