export interface FeatData {
  name: string;
  category: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  prerequisite?: string;
  repeatable?: boolean;
  asi?: { ability: string; amount: number }[];
  description: string;
  benefits: string[];
}

export const FEATS: FeatData[] = [

  // ============================================================
  // ORIGIN FEATS (available at level 1 via Human/background)
  // ============================================================
  {
    name: 'Alert',
    category: 'origin',
    description: 'You are always on the lookout for danger, gaining the following benefits.',
    benefits: [
      'Initiative Bonus: You gain a +5 bonus to Initiative.',
      'Surprise Immunity: You can\'t be surprised while you are conscious.',
      'No Advantage on Hidden Attackers: Attackers don\'t gain Advantage on attack rolls against you as a result of being hidden from you.',
    ],
  },
  {
    name: 'Crafter',
    category: 'origin',
    description: 'You have studied the art of craftsmanship, giving you the following benefits.',
    benefits: [
      'Tool Proficiency: You gain Tool proficiency with three different Artisan\'s Tools of your choice.',
      'Discount: Whenever you buy a nonmagical item, you receive a 20 percent discount.',
      'Faster Crafting: Your proficiency bonus is doubled for any ability check you make with the chosen tools.',
    ],
  },
  {
    name: 'Healer',
    category: 'origin',
    description: 'You have the training and intuition to administer first aid and other care effectively.',
    benefits: [
      'Battle Medic: If you have a Healer\'s Kit, you can use it to restore Hit Points to a creature as a Magic action. That creature can spend up to half its Hit Dice, and for each Hit Die spent, you roll the die and add the creature\'s Constitution modifier. The creature regains HP equal to the total.',
      'Stabilize: As a Bonus Action, you can expend one use of a Healer\'s Kit to stabilize a creature at 0 HP.',
    ],
  },
  {
    name: 'Lucky',
    category: 'origin',
    description: 'You have inexplicable luck that can kick in at just the right moment.',
    benefits: [
      'Luck Points: You have 3 Luck Points. Whenever you make a D20 Test, you can spend 1 Luck Point to roll an extra d20 and use either die. You can also spend 1 Luck Point when an attack roll is made against you — roll a d20 and choose which die the attacker uses.',
      'Recovery: You regain all expended Luck Points when you finish a Long Rest.',
    ],
  },
  {
    name: 'Magic Initiate',
    category: 'origin',
    description: 'You have learned the basics of a particular magical tradition.',
    benefits: [
      'Two Cantrips: You learn two cantrips of your choice from a chosen spell list (Cleric, Druid, or Wizard).',
      '1st-Level Spell: You learn one 1st-level spell from the same list. You can cast it once without a spell slot per long rest. You can also cast it using any spell slots you have.',
      'Spellcasting Ability: Use Intelligence, Wisdom, or Charisma for these spells (choose when selecting the feat).',
    ],
  },
  {
    name: 'Savage Attacker',
    category: 'origin',
    description: 'You have practiced brutality with your weapons.',
    benefits: [
      'Once per turn when you hit with a weapon, you can reroll the weapon\'s damage dice and use either total.',
    ],
  },
  {
    name: 'Skilled',
    category: 'origin',
    description: 'You have exceptional training and are proficient in more skills than most.',
    benefits: [
      'Gain proficiency in any combination of three skills or Artisan\'s Tools of your choice.',
    ],
  },
  {
    name: 'Tavern Brawler',
    category: 'origin',
    description: 'You\'ve spent time brawling in taverns and other rough places.',
    benefits: [
      'Enhanced Unarmed Strike: When you hit with your Unarmed Strike, you can deal 1d4 + Strength modifier Bludgeoning damage instead of the normal damage.',
      'Damage Rerolls: When you take the Attack action, you can replace one attack with a shove (push 5 ft or knock Prone).',
      'Improvised Weapons: You have proficiency with improvised weapons.',
      'Brawler\'s Knack: Once per round when you are hit, you can spend a reaction to use an Unarmed Strike.',
    ],
  },
  {
    name: 'Tough',
    category: 'origin',
    description: 'Your hit point maximum increases by an amount equal to twice your character level when you take this feat. Each time you gain a level thereafter, your hit point maximum increases by an additional 2 hit points.',
    benefits: [
      'Hit Point Increase: Your hit point maximum increases by 2 × your character level.',
      'Ongoing Bonus: Each level thereafter, your hit point maximum increases by an additional 2.',
    ],
  },

  // ============================================================
  // GENERAL FEATS (require level 4+)
  // ============================================================
  {
    name: 'Ability Score Improvement',
    category: 'general',
    prerequisite: 'Level 4+',
    description: 'You increase one or two ability scores of your choice. This is the default choice at ASI levels instead of a feat.',
    benefits: [
      'Increase one ability score by 2, or increase two ability scores by 1 each.',
      'You cannot increase an ability score above 20 using this feat.',
    ],
    asi: [{ ability: 'Any', amount: 2 }],
  },
  {
    name: 'Actor',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Charisma', amount: 1 }],
    description: 'Skilled at mimicry and dramatics, you gain the following benefits.',
    benefits: [
      '+1 Charisma (max 20).',
      'Mimicry: You can mimic the speech of another person or the sounds made by other creatures. A listener must succeed on a Wisdom (Insight) check vs. your Charisma (Deception) check to detect the mimicry.',
      'Impersonation: You have Advantage on Charisma (Deception) and Charisma (Performance) checks when trying to pass yourself off as a different person.',
    ],
  },
  {
    name: 'Athlete',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You have undergone extensive physical training to gain the following benefits.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Climb Speed: You gain a Climb Speed equal to your Speed.',
      'Hop Up: Standing from Prone costs only 5 feet of movement.',
      'Running Start: You can use your full movement to run before making a Long Jump or High Jump.',
    ],
  },
  {
    name: 'Charger',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You have trained to charge headlong into battle.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Charge Attack: When you use the Dash action and move at least 10 feet toward a target, you can then make one melee weapon attack or Shove as a Bonus Action.',
      'Improved Charge: If the melee attack hits on a Charge, the target takes an extra 1d8 damage.',
    ],
  },
  {
    name: 'Chef',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Constitution or Wisdom', amount: 1 }],
    description: 'Time and effort spent on preparing food rewards you and your companions.',
    benefits: [
      '+1 Constitution or Wisdom (max 20).',
      'Proficiency: You gain proficiency with Cook\'s Utensils.',
      'Nourishing Meals: During a Short Rest, you can cook special food for up to 8 creatures. Each creature that eats it regains an additional 1d8 HP when spending Hit Dice.',
      'Treats: You can prepare a number of treats equal to your proficiency bonus as part of a Long Rest. Creatures that eat a treat regain 1d8 Temporary HP.',
    ],
  },
  {
    name: 'Crossbow Expert',
    category: 'general',
    prerequisite: 'Level 4+, Proficiency with any Crossbow',
    description: 'Thanks to extensive practice with crossbows, you gain the following benefits.',
    benefits: [
      'Ignore Loading: You ignore the Loading property of crossbows with which you are proficient.',
      'No Disadvantage at Close Range: Being within 5 feet of a hostile creature doesn\'t impose Disadvantage on your ranged attack rolls.',
      'Extra Attack with Hand Crossbow: When you use the Attack action with a one-handed weapon, you can use a Bonus Action to attack with a Hand Crossbow.',
    ],
  },
  {
    name: 'Crusher',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Constitution', amount: 1 }],
    description: 'You are practiced in the art of crushing your enemies.',
    benefits: [
      '+1 Strength or Constitution (max 20).',
      'Push: Once per turn when you deal Bludgeoning damage to a creature, you can push it 5 feet away from you.',
      'Stunning Impact: Once per turn when you deal Bludgeoning damage on a critical hit, attack rolls against the creature have Advantage until the start of your next turn.',
    ],
  },
  {
    name: 'Dual Wielder',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You master fighting with two weapons.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Light Property: You can use Two-Weapon Fighting even when the one-handed melee weapons you are wielding aren\'t light.',
      'Quick Draw: You can draw or stow two one-handed weapons when you would normally be able to draw or stow only one.',
      '+1 AC: While you are wielding a separate melee weapon in each hand, you gain a +1 bonus to Armor Class.',
    ],
  },
  {
    name: 'Durable',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Constitution', amount: 1 }],
    description: 'Hardy and resilient, you gain the following benefits.',
    benefits: [
      '+1 Constitution (max 20).',
      'Defy Death: When you succeed on a Death Saving Throw, you can regain HP equal to your Constitution modifier (minimum of 1). You can do this once per Long Rest.',
      'Speedy Recovery: You can use a Bonus Action to expend one of your Hit Dice, rolling it and regaining the resulting number of HP.',
    ],
  },
  {
    name: 'Elemental Adept',
    category: 'general',
    prerequisite: 'Level 4+, Spellcasting or Pact Magic feature',
    repeatable: true,
    description: 'When you gain this feat, choose one of the following damage types: Acid, Cold, Fire, Lightning, or Thunder.',
    benefits: [
      'Spells you cast ignore resistance to your chosen damage type.',
      'When you roll damage for a spell and roll a 1 on a die of your chosen type, treat that die result as a 2 instead.',
    ],
  },
  {
    name: 'Fey Touched',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Intelligence, Wisdom, or Charisma', amount: 1 }],
    description: 'Your exposure to the Feywild\'s magic has changed you.',
    benefits: [
      '+1 Intelligence, Wisdom, or Charisma (max 20).',
      'Misty Step: You learn the Misty Step spell. You can cast it once per Long Rest without a spell slot.',
      'Bonus Divination/Enchantment: You learn one 1st-level Divination or Enchantment spell of your choice. You can cast it once per Long Rest without a spell slot.',
      'You can also cast these spells using any spell slots you have.',
    ],
  },
  {
    name: 'Gift of the Chromatic Dragon',
    category: 'general',
    prerequisite: 'Level 4+',
    description: 'You\'ve manifested some of the power of chromatic dragons.',
    benefits: [
      'Chromatic Infusion: As a Bonus Action, you can touch a simple or martial weapon and infuse it with one of these damage types: Acid, Cold, Fire, Lightning, or Poison. For the next minute, the weapon deals an extra 1d4 of that damage type on a hit. Once per Long Rest.',
      'Reactive Resistance: When you take Acid, Cold, Fire, Lightning, or Poison damage, you can use your Reaction to give yourself resistance to that instance of damage. You can do this a number of times equal to your proficiency bonus per Long Rest.',
    ],
  },
  {
    name: 'Great Weapon Master',
    category: 'general',
    prerequisite: 'Level 4+, Proficiency with any Martial Weapon',
    asi: [{ ability: 'Strength', amount: 1 }],
    description: 'You\'ve learned to use the weight of a weapon to your advantage.',
    benefits: [
      '+1 Strength (max 20).',
      'On Kill Bonus Attack: Once per turn when you score a critical hit or reduce a creature to 0 HP with a melee weapon, you can make one melee weapon attack as a Bonus Action.',
      'Cleave: On your turn, before or after making an attack with a Heavy weapon, you can make one melee weapon attack with that same weapon (no Bonus Action required). On a hit, deal damage equal to your Strength modifier (no additional modifiers).',
    ],
  },
  {
    name: 'Heavily Armored',
    category: 'general',
    prerequisite: 'Level 4+, Proficiency with Medium Armor',
    asi: [{ ability: 'Strength', amount: 1 }],
    description: 'You have trained to master the use of heavy armor.',
    benefits: [
      '+1 Strength (max 20).',
      'Armor Training: You gain proficiency with Heavy Armor.',
    ],
  },
  {
    name: 'Inspiring Leader',
    category: 'general',
    prerequisite: 'Level 4+, Charisma 13+',
    asi: [{ ability: 'Wisdom or Charisma', amount: 1 }],
    description: 'You can spend 10 minutes inspiring your companions.',
    benefits: [
      '+1 Wisdom or Charisma (max 20).',
      'Inspiring Speech: You can use a 10-minute speech to inspire up to 6 allies who can see or hear you. Each ally gains Temporary HP equal to your level + your Charisma modifier. Once per Long Rest per creature.',
    ],
  },
  {
    name: 'Keen Mind',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Intelligence', amount: 1 }],
    description: 'You have a mind that can track time, direction, and detail.',
    benefits: [
      '+1 Intelligence (max 20).',
      'Lore Knowledge: You always know which way is north, the number of hours left before the next sunrise or sunset, and can accurately recall anything you have seen or heard within the past month.',
      'Study: When you finish a Long Rest, you can pick one skill or tool and gain proficiency in it until your next Long Rest (replacing proficiency gained from a previous use of this feature).',
    ],
  },
  {
    name: 'Lightly Armored',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You have trained to master the use of light armor.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Armor Training: You gain proficiency with Light Armor and Shields.',
    ],
  },
  {
    name: 'Mage Slayer',
    category: 'general',
    prerequisite: 'Level 4+',
    description: 'You have practiced techniques useful in fighting spellcasters.',
    benefits: [
      'Concentration Breaker: When you damage a creature that is concentrating, it has Disadvantage on the Constitution save to maintain concentration.',
      'Guarded Mind: You have Advantage on saving throws against spells and magical effects.',
      'Spell Interrupter: When a creature within 5 feet of you casts a spell, you can use your Reaction to make one melee weapon attack against that creature.',
    ],
  },
  {
    name: 'Medium Armor Master',
    category: 'general',
    prerequisite: 'Level 4+, Proficiency with Medium Armor',
    description: 'You have practiced moving in medium armor to gain the following benefits.',
    benefits: [
      'No Stealth Disadvantage: Wearing medium armor doesn\'t impose Disadvantage on Dexterity (Stealth) checks.',
      'Better DEX Bonus: When wearing medium armor, you can add up to +3 to your AC from your Dexterity modifier (instead of the normal +2).',
    ],
  },
  {
    name: 'Mounted Combatant',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength, Dexterity, or Wisdom', amount: 1 }],
    description: 'You are a dangerous foe when mounted.',
    benefits: [
      '+1 Strength, Dexterity, or Wisdom (max 20).',
      'Mounted Strike: While mounted, you have Advantage on melee attack rolls against unmounted creatures smaller than your mount.',
      'Cavalier: If your mount is subjected to an effect that allows it to make a Dexterity saving throw to take only half damage, it takes no damage on a success and half damage on a failure, if you aren\'t incapacitated.',
      'Covering Mount: When a creature within 5 feet of your mount targets it with an attack, you can use your Reaction to redirect that attack to target you instead.',
    ],
  },
  {
    name: 'Observant',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Intelligence or Wisdom', amount: 1 }],
    description: 'Quick to notice details, you gain the following benefits.',
    benefits: [
      '+1 Intelligence or Wisdom (max 20).',
      'Keen Observer: Choose one of Insight, Investigation, or Perception. You gain proficiency in that skill, or Expertise if already proficient.',
      'Quick Search: You can use a Bonus Action to take the Search action.',
    ],
  },
  {
    name: 'Piercer',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You have trained to exploit the weak points of armor.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Reroll: Once per turn when you deal Piercing damage, you can reroll one of the damage dice and use either total.',
      'Critical Piercing: When you score a critical hit with a Piercing attack, you roll one additional damage die.',
    ],
  },
  {
    name: 'Poisoner',
    category: 'general',
    prerequisite: 'Level 4+',
    description: 'You can prepare and deliver deadly poisons.',
    benefits: [
      'Proficiency: You gain proficiency with the Poisoner\'s Kit.',
      'Coat Weapon: As a Bonus Action, coat one weapon or piece of ammunition with a poison you\'ve prepared. The creature hit must succeed on a DC 14 Constitution save or take 2d8 Poison damage and become Poisoned until the end of your next turn.',
      'Potent Poison: Creatures that have resistance to Poison damage don\'t have resistance to your prepared poisons.',
    ],
  },
  {
    name: 'Polearm Master',
    category: 'general',
    prerequisite: 'Level 4+, Proficiency with any Martial Weapon',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You can keep enemies at bay with reach weapons.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Butt End: When you take the Attack action with only a Glaive, Halberd, Quarterstaff, or Spear, you can use a Bonus Action to make a melee attack with the opposite end of the weapon (1d4 Bludgeoning).',
      'Reactive Strike: While wielding a reach weapon, you can use your Reaction to make an attack when a creature enters your reach.',
    ],
  },
  {
    name: 'Resilient',
    category: 'general',
    prerequisite: 'Level 4+',
    repeatable: true,
    asi: [{ ability: 'Chosen ability', amount: 1 }],
    description: 'Choose one ability score. You gain the following benefits.',
    benefits: [
      '+1 to the chosen ability score (max 20).',
      'Saving Throw Proficiency: You gain proficiency in saving throws using the chosen ability.',
    ],
  },
  {
    name: 'Ritual Caster',
    category: 'general',
    prerequisite: 'Level 4+, Intelligence, Wisdom, or Charisma 13+',
    description: 'You have learned a number of spells that you can cast as rituals.',
    benefits: [
      'Ritual Book: You acquire a ritual book holding two 1st-level spells with the Ritual tag from any class list (Intelligence, Wisdom, or Charisma, depending on choice).',
      'Ritual Learning: If you encounter a spell with the Ritual tag, you can add it to your ritual book (1 hour and 50 gp per spell level).',
      'Ritual Casting: You can cast any spell in your book as a ritual.',
    ],
  },
  {
    name: 'Sentinel',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You have mastered the art of the opportunity attack.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Opportunity Attacks Slow: When you hit a creature with an opportunity attack, its Speed becomes 0 for the rest of the current turn.',
      'No Disengage Escape: Creatures provoke opportunity attacks from you even if they take the Disengage action.',
      'Stop the Charge: When a creature makes an attack against a target other than you (and that target doesn\'t have this feat), you can use your Reaction to make a melee weapon attack against the attacking creature.',
    ],
  },
  {
    name: 'Shadow-Touched',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Intelligence, Wisdom, or Charisma', amount: 1 }],
    description: 'Your exposure to the Shadowfell\'s magic has changed you.',
    benefits: [
      '+1 Intelligence, Wisdom, or Charisma (max 20).',
      'Invisibility: You learn the Invisibility spell. You can cast it once per Long Rest without a spell slot.',
      'Bonus Illusion/Necromancy: You learn one 1st-level Illusion or Necromancy spell of your choice. You can cast it once per Long Rest without a slot.',
    ],
  },
  {
    name: 'Sharpshooter',
    category: 'general',
    prerequisite: 'Level 4+, Proficiency with any Ranged Weapon',
    asi: [{ ability: 'Dexterity', amount: 1 }],
    description: 'You can make shots that others find impossible.',
    benefits: [
      '+1 Dexterity (max 20).',
      'Bypass Cover: Your ranged weapon attacks ignore Half Cover and Three-Quarters Cover.',
      'Long Shot: When you attack with a ranged weapon, you can forgo your proficiency bonus to gain a +10 damage bonus. If the attack hits, you add +10 to the damage roll.',
      'No Disadvantage at Long Range: Attacking at long range no longer imposes Disadvantage on your attack rolls.',
    ],
  },
  {
    name: 'Shield Master',
    category: 'general',
    prerequisite: 'Level 4+, Proficiency with Shields',
    asi: [{ ability: 'Strength', amount: 1 }],
    description: 'You use shields not just for protection but also for offense.',
    benefits: [
      '+1 Strength (max 20).',
      'Shield Bash: When you take the Attack action, you can use a Bonus Action to try to Shove a creature within 5 feet with your shield.',
      'Interpose Shield: If you are subjected to an effect that allows a Dexterity saving throw to take half damage, you can use your Reaction to take no damage on a success.',
    ],
  },
  {
    name: 'Skill Expert',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Any', amount: 1 }],
    description: 'You have honed your proficiency with particular skills, granting the following benefits.',
    benefits: [
      '+1 to any ability score (max 20).',
      'Skill Proficiency: You gain proficiency in one skill of your choice.',
      'Expertise: Choose one skill you are proficient in. Your proficiency bonus is doubled for checks with that skill.',
    ],
  },
  {
    name: 'Skulker',
    category: 'general',
    prerequisite: 'Level 4+, Dexterity 13+',
    description: 'You are expert at slinking through shadows.',
    benefits: [
      'Weak Miss: When you are hidden and miss with a ranged weapon attack, making the attack doesn\'t reveal your position.',
      'Fog Vision: Dim light doesn\'t impose Disadvantage on your Perception checks.',
      'Improved Hiding: You can try to hide when you are only lightly obscured from the creature from which you are hiding.',
    ],
  },
  {
    name: 'Slasher',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You have mastered slashing weapons.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Hamstring: Once per turn when you deal Slashing damage, you can reduce the creature\'s Speed by 10 feet until the start of your next turn.',
      'Wounding Strike: When you score a critical hit with a Slashing attack, attack rolls against the creature have Disadvantage until the start of your next turn.',
    ],
  },
  {
    name: 'Speedy',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Dexterity or Constitution', amount: 1 }],
    description: 'You are agile and good at moving quickly.',
    benefits: [
      '+1 Dexterity or Constitution (max 20).',
      '+10 Speed: Your Speed increases by 10 feet.',
      'Difficult Terrain: Moving through Difficult Terrain costs no extra movement on your turn.',
      'Agile: You can take the Dash action as a Bonus Action.',
    ],
  },
  {
    name: 'Spell Sniper',
    category: 'general',
    prerequisite: 'Level 4+, Spellcasting or Pact Magic feature',
    asi: [{ ability: 'Intelligence, Wisdom, or Charisma', amount: 1 }],
    description: 'You have learned techniques to enhance your attacks with certain spells.',
    benefits: [
      '+1 Intelligence, Wisdom, or Charisma (max 20).',
      'Extended Range: The range of your spells with attack rolls is doubled.',
      'No Cover Penalty: Your spell attacks ignore Half Cover and Three-Quarters Cover.',
      'Cantrip: You learn one cantrip that requires an attack roll. Choose from any class list. Use the chosen ability for spellcasting.',
    ],
  },
  {
    name: 'Telekinetic',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Intelligence, Wisdom, or Charisma', amount: 1 }],
    description: 'You learn to move things with your mind.',
    benefits: [
      '+1 Intelligence, Wisdom, or Charisma (max 20).',
      'Mage Hand: You learn the Mage Hand cantrip. You can cast it without verbal or somatic components, and the hand is invisible.',
      'Telekinetic Shove: As a Bonus Action, you can push a creature within 30 feet 5 feet away from you or toward you. Strength save vs. 8 + proficiency + your chosen ability modifier.',
    ],
  },
  {
    name: 'Telepathic',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Intelligence, Wisdom, or Charisma', amount: 1 }],
    description: 'You awaken the ability to mentally connect with others.',
    benefits: [
      '+1 Intelligence, Wisdom, or Charisma (max 20).',
      'Telepathic Speech: You can speak telepathically to any creature within 60 feet. The creature understands you if it shares a language, though you don\'t understand it unless it has its own telepathy.',
      'Detect Thoughts: You can cast Detect Thoughts once per Long Rest without a spell slot.',
    ],
  },
  {
    name: 'War Caster',
    category: 'general',
    prerequisite: 'Level 4+, Spellcasting or Pact Magic feature',
    asi: [{ ability: 'Intelligence, Wisdom, or Charisma', amount: 1 }],
    description: 'You have practiced casting spells in the midst of combat.',
    benefits: [
      '+1 Intelligence, Wisdom, or Charisma (max 20).',
      'Concentration: You have Advantage on Constitution saving throws to maintain concentration on a spell when you take damage.',
      'Somatic with Weapons: You can perform the somatic components of spells even when you have weapons or a shield in one or both hands.',
      'Reactive Spell: When a creature provokes an opportunity attack from you, you can use your Reaction to cast a spell at the creature instead. The spell must have a casting time of one action and must target only that creature.',
    ],
  },
  {
    name: 'Weapon Master',
    category: 'general',
    prerequisite: 'Level 4+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'You have practiced extensively with a variety of weapons.',
    benefits: [
      '+1 Strength or Dexterity (max 20).',
      'Mastery Property: Whenever you finish a Long Rest, you can tune your instincts to certain weapons. Choose up to three weapons in which you have proficiency. Until your next Long Rest, you can use the Mastery property of those weapons.',
    ],
  },

  // ============================================================
  // FIGHTING STYLE FEATS (Fighters, Paladins, Rangers can swap)
  // ============================================================
  {
    name: 'Fighting Style: Archery',
    category: 'fighting-style',
    description: 'A specialized fighting style for ranged attackers.',
    benefits: [
      '+2 bonus to attack rolls with ranged weapons.',
    ],
  },
  {
    name: 'Fighting Style: Defense',
    category: 'fighting-style',
    description: 'A defensive fighting stance.',
    benefits: [
      '+1 bonus to AC while wearing armor.',
    ],
  },
  {
    name: 'Fighting Style: Dueling',
    category: 'fighting-style',
    description: 'A fighting style for single-weapon combatants.',
    benefits: [
      '+2 bonus to damage rolls when wielding a melee weapon in one hand and no other weapons.',
    ],
  },
  {
    name: 'Fighting Style: Great Weapon Fighting',
    category: 'fighting-style',
    description: 'A power-focused style for two-handed weapon users.',
    benefits: [
      'When you roll a 1 or 2 on a damage die with a two-handed or versatile melee weapon, you can reroll the die and must use the new result.',
    ],
  },
  {
    name: 'Fighting Style: Protection',
    category: 'fighting-style',
    description: 'A defensive style focused on protecting allies.',
    benefits: [
      'When a creature you can see attacks a target other than you within 5 feet, you can use your Reaction and a shield to impose Disadvantage on the attack roll.',
    ],
  },
  {
    name: 'Fighting Style: Two-Weapon Fighting',
    category: 'fighting-style',
    description: 'A style for dual-wielders.',
    benefits: [
      'When you engage in Two-Weapon Fighting, you can add your ability modifier to the damage of the off-hand attack.',
    ],
  },

  // ============================================================
  // EPIC BOON FEATS (level 19+)
  // ============================================================
  {
    name: 'Epic Boon of Combat Prowess',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    asi: [{ ability: 'Strength, Dexterity, or Constitution', amount: 1 }],
    description: 'You are a supreme warrior.',
    benefits: [
      '+1 Strength, Dexterity, or Constitution (max 30).',
      'Peerless Aim: When you miss with an attack roll, you can hit instead. Once per Short or Long Rest.',
    ],
  },
  {
    name: 'Epic Boon of Dimensional Travel',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    asi: [{ ability: 'Intelligence, Wisdom, or Charisma', amount: 1 }],
    description: 'You gain the ability to slip through space.',
    benefits: [
      '+1 Intelligence, Wisdom, or Charisma (max 30).',
      'Blink Steps: Immediately after you take the Attack action or the Magic action, you can teleport up to 30 feet to an unoccupied space you can see.',
    ],
  },
  {
    name: 'Epic Boon of Fortitude',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    asi: [{ ability: 'Constitution', amount: 1 }],
    description: 'Your hit points and resilience become legendary.',
    benefits: [
      '+1 Constitution (max 30).',
      'Dauntless: Your hit point maximum increases by 40.',
    ],
  },
  {
    name: 'Epic Boon of Irresistible Offense',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    asi: [{ ability: 'Strength or Dexterity', amount: 1 }],
    description: 'Your attacks become almost impossible to resist.',
    benefits: [
      '+1 Strength or Dexterity (max 30).',
      'Overcome Resistance: The damage from your attacks and spells ignores resistance to Bludgeoning, Piercing, or Slashing damage.',
      'Crits Ignore Immunity: When you score a critical hit, you can deal one of those damage types even if the target is immune.',
    ],
  },
  {
    name: 'Epic Boon of Spell Recall',
    category: 'epic-boon',
    prerequisite: 'Level 19+, Spellcasting or Pact Magic feature',
    asi: [{ ability: 'Intelligence, Wisdom, or Charisma', amount: 1 }],
    description: 'You gain the ability to recall spent spell power.',
    benefits: [
      '+1 Intelligence, Wisdom, or Charisma (max 30).',
      'Free Casting: You can cast any spell you know or have prepared without expending a spell slot. Once per Long Rest.',
    ],
  },
  {
    name: 'Epic Boon of the Night Spirit',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    asi: [{ ability: 'Dexterity, Intelligence, or Charisma', amount: 1 }],
    description: 'You merge with the shadows.',
    benefits: [
      '+1 Dexterity, Intelligence, or Charisma (max 30).',
      'Merge with Shadows: While in Dim Light or Darkness, you can give yourself the Invisible condition as a Bonus Action. The condition ends on you when you move, take an action, or take a Bonus Action.',
    ],
  },
  { name: 'Musician', category: 'origin', description: 'You gain proficiency with three musical instruments of your choice. You can use a musical instrument as a spellcasting focus. You can use a Bonus Action to inspire one creature that can see or hear you and knows your language: they gain Heroic Inspiration.', prerequisite: undefined , benefits: []},

  { name: 'Defensive Duelist', category: 'general', description: 'When wielding a Finesse weapon and attacked by a creature you can see, you can use your Reaction to add your proficiency bonus to your AC for that attack, potentially causing a miss.', prerequisite: 'Dexterity 13+' , benefits: []},
  { name: 'Grappler', category: 'general', description: 'You have advantage on attack rolls against creatures you are grappling. You can use your action to try to pin a creature grappled by you — it is restrained until the grapple ends. Mass Critical Hits: creatures grappled by you suffer a -2 penalty to escape.', prerequisite: 'Strength or Dexterity 13+' , benefits: []},
  { name: 'Mobile', category: 'general', description: 'Your speed increases by 10 feet. When you use the Dash action, difficult terrain doesn\'t cost you extra movement on that turn. When you make a melee attack against a creature, you don\'t provoke Opportunity Attacks from it for the rest of the turn, whether or not you hit.', prerequisite: undefined , benefits: []},

  { name: 'Epic Boon of Energy Resistance', category: 'epic-boon', description: 'You gain Resistance to two of the following damage types of your choice: Acid, Cold, Fire, Lightning, Necrotic, Poison, Psychic, Radiant, Thunder. Whenever you finish a Long Rest, you can change your choices. Additionally, you ignore the effects of Extreme Cold and Extreme Heat.', prerequisite: 'Level 19+' , benefits: []},
  { name: 'Epic Boon of Fate', category: 'epic-boon', description: 'When another creature you can see within 60 feet makes a D20 Test, you can roll 1d10 and apply the result as a bonus or penalty (your choice) to the roll. You can use this benefit a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest.', prerequisite: 'Level 19+' , benefits: []},
  { name: 'Epic Boon of Recovery', category: 'epic-boon', description: 'You can use your Bonus Action to regain a number of Hit Points equal to half your Hit Point maximum. Once you use this benefit, you can\'t use it again until you finish a Long Rest. In addition, your Hit Point maximum can\'t be reduced.', prerequisite: 'Level 19+' , benefits: []},
  { name: 'Epic Boon of Skill', category: 'epic-boon', description: 'Your Proficiency Bonus is doubled for any ability check you make that uses one of your skill or tool proficiencies of your choice. Whenever you finish a Long Rest, you can change your choice. In addition, you gain proficiency in all skills.', prerequisite: 'Level 19+' , benefits: []},
  { name: 'Epic Boon of Speed', category: 'epic-boon', description: 'Your Speed increases by 30 feet. In addition, you are immune to the Difficult Terrain movement penalty.', prerequisite: 'Level 19+' , benefits: []},
  { name: 'Epic Boon of Truesight', category: 'epic-boon', description: 'You gain Truesight with a range of 60 feet.', prerequisite: 'Level 19+' , benefits: []},

  { name: 'Fighting Style: Blind Fighting', category: 'fighting-style', description: 'You have Blindsight with a range of 10 feet. Within that range, you can effectively see anything that isn\'t behind Total Cover even if you are Blinded or in Darkness. Moreover, you can see an Invisible creature within that range unless the creature successfully hides from you.', prerequisite: 'Fighting Style feature' , benefits: []},
  { name: 'Fighting Style: Interception', category: 'fighting-style', description: 'When a creature you can see hits a target (other than you) within 5 feet of you with an attack, you can use your Reaction to reduce the damage by 1d10 + your Proficiency Bonus (to a minimum of 0 damage). You must be wielding a Shield or a Simple or Martial weapon to use this reaction.', prerequisite: 'Fighting Style feature' , benefits: []},
  { name: 'Fighting Style: Thrown Weapon Fighting', category: 'fighting-style', description: 'You can draw a weapon that has the Thrown property as part of the attack you make with the weapon. In addition, when you hit with a ranged attack using a thrown weapon, you gain a +2 bonus to the damage roll.', prerequisite: 'Fighting Style feature' , benefits: []},
  { name: 'Fighting Style: Unarmed Fighting', category: 'fighting-style', description: 'Your unarmed strikes can deal bludgeoning damage equal to 1d6 + your Strength modifier on a hit. If you aren\'t wielding any weapons or a Shield when you make the attack roll, the d6 becomes a d8. At the start of each of your turns, you can deal 1d4 bludgeoning damage to one creature grappled by you.', prerequisite: 'Fighting Style feature' , benefits: []},
];

export const FEAT_MAP: Record<string, FeatData> = Object.fromEntries(FEATS.map(f => [f.name, f]));
export const FEAT_CATEGORIES = ['origin', 'general', 'fighting-style', 'epic-boon'] as const;

