/**
 * Psion Psionic Disciplines — UA 2025
 * Disciplines are chosen at level 2 and every few levels after.
 * Each grants a passive benefit or an active ability powered by Psionic Energy Dice.
 * Discipline count: 2 at lv2, 3 at lv5, 4 at lv10, 5 at lv13, 6 at lv17.
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
    actionType: 'reaction',
    dieCost: '1 die',
    description: 'When you take damage, you can use your Reaction and expend 1 Psionic Energy Die to reduce the damage by the die roll + your Intelligence modifier. This represents your psionically hardening your body against the impact.',
  },
  {
    id: 'bolstering-precognition',
    name: 'Bolstering Precognition',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die',
    description: 'Whenever you make an ability check, attack roll, or saving throw, you can expend 1 Psionic Energy Die and add the result to the roll (after seeing the d20 result, before the outcome is determined). You can use this ability once per turn.',
  },
  {
    id: 'destructive-thoughts',
    name: 'Destructive Thoughts',
    type: 'passive',
    description: 'Your telekinetic force tears at your enemies\' minds as well as their bodies. When you hit a creature with a psionic attack and deal Psychic or Force damage, you can deal bonus damage equal to your Intelligence modifier (minimum 1). This bonus applies once per turn.',
  },
  {
    id: 'devilish-tongue',
    name: 'Devilish Tongue',
    type: 'passive',
    description: 'You gain proficiency in the Deception and Persuasion skills. If you are already proficient in these skills, your proficiency bonus is doubled for any ability check that uses them.',
  },
  {
    id: 'expanded-awareness',
    name: 'Expanded Awareness',
    type: 'both',
    description: 'You gain proficiency in the Perception and Investigation skills. Additionally, as a Bonus Action, you can expend 1 Psionic Energy Die to extend your senses psionically: for 1 minute, you gain Truesight with a range of 10 feet, and you can sense the presence of hidden or invisible creatures within 30 feet of you (though not their exact location).',
    dieCost: '1 die',
    actionType: 'bonus',
  },
  {
    id: 'id-insinuation',
    name: 'Id Insinuation',
    type: 'active',
    actionType: 'action',
    dieCost: '2 dice',
    description: 'You can use your action and expend 2 Psionic Energy Dice to target one creature you can see within 60 feet. The target must make a Wisdom saving throw (DC = your Psion spell save DC). On a failed save, the target is Incapacitated until the end of its next turn, overwhelmed by its own subconscious impulses. On a successful save, nothing happens.',
  },
  {
    id: 'inerrant-aim',
    name: 'Inerrant Aim',
    type: 'active',
    actionType: 'free',
    dieCost: '1 die',
    description: 'When you make an attack roll and miss, you can expend 1 Psionic Energy Die to reroll the die. You must use the new roll. If the reroll also misses, the die is still expended.',
  },
  {
    id: 'observant-mind',
    name: 'Observant Mind',
    type: 'passive',
    description: 'Your psionic senses become attuned to the environment. You gain proficiency in the Insight skill. You can read lips; if you can see a creature\'s mouth while it is speaking a language you understand, you can interpret what it\'s saying by lip reading. Additionally, you can\'t be Surprised while you are Conscious.',
  },
  {
    id: 'psionic-backlash',
    name: 'Psionic Backlash',
    type: 'active',
    actionType: 'reaction',
    dieCost: '1 die',
    description: 'When a creature within 30 feet of you casts a spell that targets only you, you can use your Reaction and expend 1 Psionic Energy Die to impose Disadvantage on the spell\'s attack roll or force the caster to make a Concentration check (DC = 10 + the die result), even if they aren\'t concentrating. This represents your mind pushing back against the incoming magical assault.',
  },
  {
    id: 'psionic-guards',
    name: 'Psionic Guards',
    type: 'passive',
    description: 'You erect constant psionic shielding around your mind. You are immune to magic that allows other creatures to read your thoughts, determine whether you are lying, know your alignment, or know your creature type. Additionally, you have Advantage on saving throws against being Charmed or Frightened.',
  },
  {
    id: 'sharpened-mind',
    name: 'Sharpened Mind',
    type: 'passive',
    description: 'Your psionic focus enhances your mental capabilities. Your Intelligence score increases by 2, to a maximum of 22. Additionally, you gain proficiency in one of the following skills of your choice: Arcana, History, Nature, or Religion.',
  },
  {
    id: 'forced-empathy',
    name: 'Forced Empathy',
    type: 'active',
    actionType: 'action',
    dieCost: '1 die',
    description: 'You can use your action and expend 1 Psionic Energy Die to reach out psionically and share an emotion with a creature you can see within 60 feet. You choose one of the following emotions to project: Fear (target is Frightened of you until end of its next turn, Wis save negates), Calm (removes one condition of Charmed or Frightened, no save), or Rage (target makes one melee attack against a creature of your choice within its reach as a Reaction, Wis save negates). The DC is your Psion spell save DC.',
  },
  {
    id: 'psionic-speed',
    name: 'Psionic Speed',
    type: 'active',
    actionType: 'bonus',
    dieCost: '1 die',
    description: 'You can use a Bonus Action and expend 1 Psionic Energy Die to propel yourself with telekinetic force. Until the end of your turn, your Speed doubles and you can move through occupied spaces (you must end your movement in an unoccupied space). The die is not expended until the end of the turn.',
  },
  {
    id: 'mental-fortress',
    name: 'Mental Fortress',
    type: 'active',
    actionType: 'reaction',
    dieCost: '2 dice',
    description: 'When you fail a saving throw against a spell or magical effect, you can use your Reaction and expend 2 Psionic Energy Dice to reroll the saving throw. You must use the new roll. Additionally, you have Resistance to Psychic damage.',
  },
];

/** Get disciplines available at a given Psion level */
export function getAvailableDisciplines(psionLevel: number): PsionDiscipline[] {
  return PSION_DISCIPLINES; // all disciplines are available regardless of level
}

/** Get the number of disciplines a Psion has at a given level */
export function getDisciplineCount(psionLevel: number): number {
  if (psionLevel >= 17) return 6;
  if (psionLevel >= 13) return 5;
  if (psionLevel >= 10) return 4;
  if (psionLevel >= 5) return 3;
  return 2;
}
