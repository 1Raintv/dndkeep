import type { ClassData } from '../types';
import { SPELL_MAP } from './spells';

export const CLASSES: ClassData[] = [
  {
    name: 'Barbarian', hit_die: 12,
    primary_abilities: ['strength', 'constitution'],
    saving_throw_proficiencies: ['strength', 'constitution'],
    skill_choices: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
    skill_count: 2,
    armor_proficiencies: ['Light Armor', 'Medium Armor', 'Shields'],
    weapon_proficiencies: ['Simple Weapons', 'Martial Weapons'],
    tool_proficiencies: [],
    is_spellcaster: false, spellcasting_ability: null, spellcaster_type: 'none',
    subclasses: [
      {
        name: 'Path of the Berserker', unlock_level: 3,
        description: "Channel rage into pure destructive frenzy. Extra attack as Bonus Action while raging, shrug off Charmed/Frightened, retaliate on damage, and eventually intimidate enemies.",
        features: [
          { level: 3, name: 'Frenzy', description: "While raging, you can make a single melee weapon attack as a Bonus Action on each of your turns. When you do, the attack deals extra damage equal to your Rage Damage bonus.", descriptionLong: (c) => { const bonus = c.level >= 16 ? 4 : c.level >= 9 ? 3 : 2; return `While your Rage is active, you can make one melee weapon attack as a Bonus Action on each of your turns. That attack deals extra damage equal to your current Rage Damage bonus (+${bonus} at your level). This effectively gives you a third attack each round once you have Extra Attack, making Berserker one of the highest single-target damage paths.`; }, isChoice: false },
          { level: 6, name: 'Mindless Rage', description: "While raging, the Charmed and Frightened conditions are removed from you instantly and cannot be applied.", isChoice: false },
          { level: 10, name: 'Retaliation', description: "When you take damage from a creature within 5 feet, use your Reaction to make one melee weapon attack against that creature.", isChoice: false },
          { level: 14, name: 'Intimidating Presence', description: "Magic Action: force a creature within 30 ft to make a Wisdom save or be Frightened of you. You can extend the effect on later turns as a Bonus Action.", descriptionLong: "As a Magic action, you can target one creature within 30 ft that can see or hear you, forcing it to make a Wisdom saving throw (DC 8 + your proficiency bonus + your Strength modifier). On a failure, the creature has the Frightened condition for 1 minute. At the end of each of its turns, it repeats the save, ending the effect on a success. On each of your later turns you can use a Bonus Action to refresh the Frightened condition.", save: { ability: 'WIS', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
        ],
      },
      {
        name: 'Path of the Wild Heart', unlock_level: 3,
        description: "Channel an animal spirit each rage: Bear (resistance), Eagle (fly/sight), Wolf (knock Prone), Elk (speed). Pick a permanent Aspect at level 6.",
        features: [
          { level: 3, name: 'Animal Speaker', description: "Cast Beast Sense and Speak with Animals without expending a spell slot. Wisdom is your spellcasting ability.", isChoice: false },
          { level: 3, name: 'Rage of the Wilds', description: "Choose a spirit at the start of each rage. Bear: resistance to all damage except Psychic. Eagle: see up to 1 mile clearly, ranged attacks don't impose disadvantage during movement. Wolf: attacks can knock target Prone (Str save). Elk: Speed increases by 15 feet.", isChoice: true, choiceType: 'other' },
          { level: 6, name: 'Aspect of the Wilds', description: "Choose a permanent benefit: Bear (resistance to Cold/Fire/Lightning), Eagle (Perception proficiency, no darkness disadvantage), Wolf (Stealth proficiency, no difficult terrain in forests), Elk (Athletics proficiency, push bonus).", isChoice: true, choiceType: 'other' },
          { level: 10, name: 'Nature Speaker', description: "Cast Commune with Nature without a spell slot once per Long Rest. Cast Dominate Beast once per Long Rest.", isChoice: false },
          { level: 14, name: 'Power of the Wilds', description: "While raging, Bonus Action to manifest a spirit effect: Bear (30 ft aura reducing incoming damage for allies), Eagle (fly speed = walk speed), Wolf (allies ignore difficult terrain near you), Elk (you and nearby allies gain +15 ft speed).", isChoice: false },
        ],
      },
      {
        name: 'Path of the World Tree', unlock_level: 3,
        description: "Draw power from Yggdrasil. Gain Temp HP and share them with allies on Rage, teleport enemies through branches, eventually travel between planes.",
        features: [
          { level: 3, name: 'Vitality of the Tree', description: (c) => `When you enter Rage, gain ${c.level} Temporary Hit Points, and a nearby ally can draw on the tree's vitality too.`, descriptionLong: (c) => `When you activate your Rage, you gain Temporary Hit Points equal to your Barbarian level (currently ${c.level}). Additionally, at the start of each of your turns while raging, one creature of your choice within 10 ft can gain ${Math.floor(c.level/2)} Temporary Hit Points (half your level) if it doesn't already have Temp HP from this feature. A strong defensive anchor for you and the front line.`, isChoice: false },
          { level: 6, name: 'Branches of the Tree', description: "While raging, when a creature you can see starts its turn within 30 feet, use your Reaction to teleport it to an unoccupied space within 5 feet of you (Str save to resist).", isChoice: false },
          { level: 10, name: 'Battering Roots', description: "Magical vines erupt on your weapon attacks. On a hit you can push the target 15 feet horizontally (no save). Gain Advantage on Strength (Athletics) checks.", isChoice: false },
          { level: 14, name: 'Travel Along the Tree', description: "When you activate Rage and at the start of each of your turns while raging, teleport up to 60 feet to an unoccupied space you can see.", isChoice: false },
        ],
      },
      {
        name: 'Path of the Zealot', unlock_level: 3,
        description: "Channel divine fury. Every hit radiates sacred damage, you can be raised without material cost, and at level 14 your rage literally prevents you from dying.",
        features: [
          { level: 3, name: 'Divine Fury', description: "While raging, the first creature you hit each turn with a weapon takes extra damage (Radiant or Necrotic).", descriptionLong: (c) => { const dice = 1 + Math.floor(c.level / 2); return `While your Rage is active, the first creature you hit on each of your turns with a weapon attack takes an extra ${dice}d6 damage \u2014 either Radiant or Necrotic, your choice (1d6 + half your Barbarian level in d6, so ${dice}d6 at level ${c.level}). This scales into a substantial per-turn damage rider that few other martials match.`; }, isChoice: false },
          { level: 3, name: 'Warrior of the Gods', description: "Your soul is marked for divine service. Raise Dead, Resurrection, and True Resurrection cast on you require no material components.", isChoice: false },
          { level: 6, name: 'Fanatical Focus', description: "Once per Rage, when you fail a saving throw, you can reroll it and must use the new result.", descriptionLong: "Once per Rage, if you fail a saving throw, you can reroll it, using the new roll. This can turn a failed save against a dangerous spell into a success at a critical moment \u2014 once per Rage, refreshing every time you enter a new Rage.", isChoice: false },
          { level: 10, name: 'Zealous Presence', description: "Once per Long Rest, as a Bonus Action, unleash a battle cry. Up to 10 creatures of your choice within 60 feet gain Advantage on attack rolls and saving throws until the start of your next turn.", isChoice: false },
          { level: 14, name: 'Rage Beyond Death', description: "While raging, having 0 Hit Points doesn't knock you Unconscious. You can still act normally, but you die if your HP aren't raised above 0 when your Rage ends.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Bard', hit_die: 8,
    primary_abilities: ['charisma'],
    saving_throw_proficiencies: ['dexterity', 'charisma'],
    skill_choices: ['Acrobatics','Animal Handling','Arcana','Athletics','Deception','History','Insight','Intimidation','Investigation','Medicine','Nature','Perception','Performance','Persuasion','Religion','Sleight of Hand','Stealth','Survival'],
    skill_count: 3,
    armor_proficiencies: ['Light Armor'],
    weapon_proficiencies: ['Simple Weapons', 'Hand Crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
    tool_proficiencies: ['Three Musical Instruments of your choice'],
    is_spellcaster: true, spellcasting_ability: 'charisma', spellcaster_type: 'full',
    subclasses: [
      {
        name: 'College of Dance', unlock_level: 3,
        description: "Use movement as magic. Unarmored defense scales with CHA, Dazzling Footwork enhances attacks and AC, and high-level evasion protects nearby allies.",
        features: [
          { level: 3, name: 'Dazzling Footwork', description: "While unarmored and not using a Shield, your AC equals 10 + Dex mod + Cha mod, and your Unarmed Strikes can deal Bardic Inspiration die damage.", descriptionLong: (c) => { const die = c.level >= 15 ? 'd12' : c.level >= 10 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; return `While you aren't wearing armor or wielding a Shield, your base AC equals 10 + your Dexterity modifier + your Charisma modifier. You can also use Dexterity for Unarmed Strikes, and once per turn deal ${die} (your Bardic Inspiration die) + Dex damage with an Unarmed Strike instead of the normal amount, without spending an Inspiration use. A nimble, mobile defensive style.`; }, isChoice: false },
          { level: 6, name: 'Inspiring Movement', description: "When you move at least 10 feet on your turn, use your Reaction to expend one Bardic Inspiration die and let one ally within 5 feet of your destination move up to half their Speed (no Opportunity Attacks) and add the Bardic Inspiration roll to one attack roll or ability check.", isChoice: false },
          { level: 14, name: 'Leading Evasion', description: "When subjected to an effect with a Dexterity save for half damage: take no damage on success, half on failure. Allies within 5 feet making the same save also gain this benefit.", isChoice: false },
        ],
      },
      {
        name: 'College of Glamour', unlock_level: 3,
        description: "Weave fey enchantment into performances. Distribute Temp HP to allies, charm crowds for hours, and cloak yourself in Fey majesty.",
        features: [
          { level: 3, name: 'Mantle of Inspiration', description: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); const thp = c.level >= 15 ? 14 : c.level >= 10 ? 10 : c.level >= 5 ? 8 : 5; return `Bonus Action (spend a Bardic Inspiration use): grant ${cha} creatures ${thp} Temp HP each, and each can immediately use its Reaction to move without provoking.`; }, descriptionLong: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); const thp = c.level >= 15 ? 14 : c.level >= 10 ? 10 : c.level >= 5 ? 8 : 5; return `As a Bonus Action, you can expend one use of Bardic Inspiration to grant Temporary Hit Points to a number of creatures equal to your Charisma modifier (currently ${cha}), within 60 ft. Each gains ${thp} Temp HP (scales 5/8/10/14 at levels 3/5/10/15) and can immediately use its Reaction to move up to its Speed without provoking Opportunity Attacks. Great for a sudden reposition or to blunt an alpha strike.`; }, isChoice: false },
          { level: 3, name: 'Enthralling Performance', description: "After performing for at least 1 minute, choose up to Charisma modifier creatures who heard it. Each must succeed on a Wisdom save (DC = spell save DC) or be Charmed by you for 1 hour, regarding you as a friendly acquaintance.", isChoice: false },
          { level: 6, name: 'Mantle of Majesty', description: "Bonus Action: take on Fey appearance for 1 minute. Cast Command as a Bonus Action without expending a spell slot. Targets have Disadvantage on the saving throw. Once per Long Rest.", isChoice: false },
          { level: 14, name: 'Unbreakable Majesty', description: "Bonus Action: become supernaturally majestic for 1 minute. A creature that attacks you must first succeed on a Charisma save or its attack misses and it can't attack you this turn.", descriptionLong: "As a Bonus Action, you assume a majestic presence for 1 minute or until you're Incapacitated. For the duration, whenever a creature tries to attack you for the first time on a turn, it must make a Charisma saving throw against your spell save DC. On a failure, it can't attack you this turn (and must choose a new target or waste the attack); on a success it can attack normally. Once per Short or Long Rest.", save: { ability: 'CHA', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
        ],
      },
      {
        name: 'College of Lore', unlock_level: 3,
        description: "Learn secrets from every tradition. Cutting Words debuffs enemies with your Bardic die. At higher levels you gain extra magical secrets beyond the class default.",
        features: [
          { level: 3, name: 'Bonus Proficiencies', description: "Gain proficiency in three skills of your choice.", isChoice: true, choiceType: 'skill', choiceCount: 3 },
          { level: 3, name: 'Cutting Words', description: (c) => { const die = c.level >= 15 ? 'd12' : c.level >= 10 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; return `Reaction (spend a Bardic Inspiration use): subtract your Bardic die (${die}) from a creature's attack roll, ability check, or damage roll within 60 ft.`; }, descriptionLong: (c) => { const die = c.level >= 15 ? 'd12' : c.level >= 10 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; return `When a creature within 60 ft that you can see makes a damage roll or succeeds on an attack roll or ability check, you can use your Reaction to expend one use of Bardic Inspiration and roll your Bardic Inspiration die (${die}), subtracting the number rolled from the creature's roll. You can do this after the roll but before you know the outcome \u2014 potentially turning a hit into a miss or shaving a chunk off a big hit.`; }, isChoice: false },
          { level: 6, name: 'Magical Discoveries', description: "Learn two additional spells of your choice from any class spell list. These count as Bard spells and don't count against your spells known.", isChoice: true, choiceType: 'spells', choiceCount: 2 },
          { level: 14, name: 'Peerless Skill', description: "When you make an ability check and fail, expend one Bardic Inspiration die, roll it, and add the result to the check, potentially turning failure into success. Once per Short or Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'College of Valor', unlock_level: 3,
        description: "Combine blade and song. Bardic Inspiration bolsters attack rolls and AC, Extra Attack at level 6, and eventually cast spells alongside weapon attacks.",
        features: [
          { level: 3, name: 'Combat Inspiration', description: "Creatures holding your Bardic Inspiration die can add it to a weapon's damage roll, or add it to their AC against one attack (as a Reaction).", descriptionLong: "A creature that has one of your Bardic Inspiration dice can use it in two extra ways: it can roll the die and add it to a weapon damage roll it just made; or, when it (or another creature it can see) is hit by an attack, it can use its Reaction to roll the die and add it to its AC against that attack, potentially turning the hit into a miss. This is in addition to the normal Bardic Inspiration use.", isChoice: false },
          { level: 3, name: 'Martial Training', description: "Gain proficiency with Medium Armor, Shields, and Martial Weapons.", isChoice: false },
          { level: 6, name: 'Extra Attack', description: "You can attack twice instead of once when you take the Attack action.", isChoice: false },
          { level: 14, name: 'Battle Magic', description: "When you use the Magic action to cast a Bard spell, you can make one weapon attack as a Bonus Action.", descriptionLong: "When you take the Magic action to cast a Bard spell, you can make one weapon attack as a Bonus Action on the same turn. Combined with Extra Attack (level 6), this lets a Valor Bard blend a leveled spell with weapon damage each round \u2014 the hallmark of the martial spellcaster.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Cleric', hit_die: 8,
    primary_abilities: ['wisdom'],
    saving_throw_proficiencies: ['wisdom', 'charisma'],
    skill_choices: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
    skill_count: 2,
    armor_proficiencies: ['Light Armor', 'Medium Armor', 'Shields'],
    weapon_proficiencies: ['Simple Weapons'],
    tool_proficiencies: [],
    is_spellcaster: true, spellcasting_ability: 'wisdom', spellcaster_type: 'full',
    subclasses: [
      {
        name: 'Life Domain', unlock_level: 3,
        spell_list: ['Bless', 'Cure Wounds', 'Aid', 'Lesser Restoration', 'Mass Healing Word', 'Revivify', 'Death Ward', 'Guardian of Faith', 'Mass Cure Wounds', 'Raise Dead'],
        description: "Master of healing magic. Every healing spell restores extra HP, Channel Divinity distributes mass healing, and at level 17 all healing dice are maximized.",
        features: [
          { level: 3, name: 'Life Domain Spells', description: "Always prepared: Bless, Cure Wounds; Aid, Lesser Restoration; Mass Healing Word, Revivify; Death Ward, Guardian of Faith; Mass Cure Wounds, Raise Dead.", isChoice: false },
          { level: 3, name: 'Disciple of Life', description: "When you cast a level 1+ spell that restores Hit Points, the target regains extra HP equal to 2 + the spell's level.", descriptionLong: "Whenever you use a spell of level 1 or higher to restore Hit Points to a creature, that creature regains additional Hit Points equal to 2 + the spell's level. This applies once per casting (to one target of the spell), making every heal you cast meaningfully bigger \u2014 e.g. a 3rd-level slot adds +5 HP.", isChoice: false },
          { level: 3, name: 'Preserve Life', description: (c) => `Channel Divinity (Magic action): restore a total of ${c.level * 5} Hit Points divided among creatures within 30 ft, up to half each one's HP maximum.`, descriptionLong: (c) => `As a Magic action, you expend a use of Channel Divinity to restore Hit Points equal to five times your Cleric level (currently ${c.level * 5}), divided as you choose among creatures within 30 ft. This feature can't raise a creature above half its Hit Point maximum, and it can't affect Undead or Constructs. A powerful party-wide stabilize after a rough exchange.`, isChoice: false },
          { level: 6, name: 'Blessed Healer', description: "When you cast a healing spell of level 1 or higher that restores HP to any creature other than yourself, you also regain HP equal to 2 + the spell's level.", isChoice: false },
          { level: 8, name: 'Divine Strike', description: (c) => `Once per turn when you hit with a weapon, deal an extra ${c.level >= 14 ? '2d8' : '1d8'} damage of your weapon's type.`, descriptionLong: (c) => `Once on each of your turns when you hit with a weapon attack, deal an extra ${c.level >= 14 ? '2d8' : '1d8'} damage of the same type as the weapon (1d8 at levels 8\u201313, 2d8 at 14+).`, isChoice: false },
          { level: 17, name: 'Supreme Healing', description: "When you would roll dice to restore Hit Points with a spell, you instead use the highest number possible for each die.", descriptionLong: "When you would normally roll one or more dice to restore Hit Points with a spell, you instead use the highest number possible for each die. For example, Cure Wounds at a level that rolls 2d8 now restores 16 (plus modifiers) automatically. Combined with Disciple of Life and Blessed Healer, your healing becomes maximally efficient.", isChoice: false },
        ],
      },
      {
        name: 'Light Domain', unlock_level: 3,
        spell_list: ['Burning Hands', 'Faerie Fire', 'Flaming Sphere', 'Scorching Ray', 'Daylight', 'Fireball', 'Guardian of Faith', 'Wall of Fire', 'Flame Strike', 'Scrying'],
        description: "Wield radiant fire. Impose Disadvantage on attacks targeting you, scorch enemies with Radiance of the Dawn, and extend your protective Flare to allies.",
        features: [
          { level: 3, name: 'Light Domain Spells', description: "Always prepared: Burning Hands, Faerie Fire; Flaming Sphere, Scorching Ray; Daylight, Fireball; Guardian of Faith, Wall of Fire; Flame Strike, Scrying.", isChoice: false },
          { level: 3, name: 'Warding Flare', description: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Reaction when a creature within 30 ft attacks you: impose Disadvantage on that attack roll. ${wis} use(s) per Long Rest.`; }, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `When a creature you can see within 30 ft makes an attack roll against you, you can use your Reaction to impose Disadvantage on that roll, flaring light to spoil its aim. A creature that can't be Blinded is immune. You can use this a number of times equal to your Wisdom modifier (currently ${wis}, minimum 1), regaining all uses on a Long Rest. From level 6 (Improved Flare) you can also protect other creatures within 30 ft.`; }, isChoice: false },
          { level: 3, name: 'Radiance of the Dawn', description: (c) => `Channel Divinity (Magic action): dispel magical Darkness within 30 ft, and each enemy there makes a Constitution save, taking ${2 + Math.floor(c.level/2)}d10 Radiant damage (half on a success).`, descriptionLong: (c) => { const dice = 2 + Math.floor(c.level/2); return `As a Magic action, you expend a use of Channel Divinity to emit dawn light. Any magical Darkness within 30 ft is dispelled, and each hostile creature within 30 ft makes a Constitution saving throw, taking ${dice}d10 Radiant damage on a failure (2d10 + 1d10 per two Cleric levels) or half as much on a success. A strong AoE that also clears Darkness effects.`; }, save: { ability: 'CON', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
          { level: 6, name: 'Improved Flare', description: "You can also use Warding Flare when a creature you can see within 30 feet attacks a creature other than you.", isChoice: false },
          { level: 8, name: 'Potent Spellcasting', description: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Add your Wisdom modifier (+${wis}) to the damage you deal with any Cleric cantrip.`; }, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `You add your Wisdom modifier (currently +${wis}) to the damage you deal with any Cleric cantrip. Cantrips like Sacred Flame and Toll the Dead become a reliable damage floor every turn, scaling with the same stat that powers your spell DC.`; }, isChoice: false },
          { level: 17, name: 'Corona of Light', description: "As a Magic action, activate an aura of sunlight for 1 minute: Bright Light 60 ft, Dim Light 30 ft. Enemies in Bright Light have Disadvantage on saves against Fire or Radiant damage spells.", isChoice: false },
        ],
      },
      {
        name: 'Trickery Domain', unlock_level: 3,
        spell_list: ['Charm Person', 'Disguise Self', 'Invisibility', 'Pass Without Trace', 'Hypnotic Pattern', 'Nondetection', 'Confusion', 'Dimension Door', 'Dominate Person', 'Modify Memory'],
        description: "Master of deception. Create illusory duplicates to cast through, become invisible at will via Channel Divinity, and eventually shift between planes.",
        features: [
          { level: 3, name: 'Trickery Domain Spells', description: "Always prepared: Charm Person, Disguise Self; Invisibility, Pass without Trace; Hypnotic Pattern, Nondetection; Confusion, Dimension Door; Dominate Person, Modify Memory.", isChoice: false },
          { level: 3, name: 'Blessing of the Trickster', description: "Touch a willing creature to grant it Advantage on Dexterity (Stealth) checks for 1 hour. Once per Short or Long Rest.", isChoice: false },
          { level: 3, name: 'Invoke Duplicity', description: "Channel Divinity (Bonus Action): create an illusory duplicate within 30 ft for 1 minute. Cast spells as though from its space, and gain Advantage on attacks against creatures within 5 ft of it.", descriptionLong: "As a Bonus Action, you expend a use of Channel Divinity to create a perfect illusory duplicate of yourself in an unoccupied space within 30 ft, lasting 1 minute (Concentration). You can move it up to 30 ft as a Bonus Action (no farther than 120 ft from you), cast spells as though you were in its space, and you have Advantage on attack rolls against any creature within 5 ft of the duplicate while you're also within 5 ft of that creature. At level 17 (Improved Duplicity) you can create up to four duplicates.", isChoice: false },
          { level: 6, name: 'Cloak of Shadows', description: "Channel Divinity: as a Magic action, become Invisible until the start of your next turn or until you attack, deal damage, or cast a spell.", isChoice: false },
          { level: 8, name: 'Divine Strike', description: "Once per turn when you hit with a weapon attack, deal an extra 1d8 Poison damage (2d8 at level 14).", isChoice: false },
          { level: 17, name: 'Improved Duplicity', description: "Create up to four duplicates at once with Invoke Duplicity. Move any number of them as a Bonus Action. Each duplicate grants Advantage on attacks against creatures within 5 feet of it.", isChoice: false },
        ],
      },
      {
        name: 'War Domain', unlock_level: 3,
        spell_list: ['Divine Favor', 'Shield of Faith', 'Magic Weapon', 'Spiritual Weapon', "Crusader's Mantle", 'Spirit Guardians', 'Fire Shield', 'Freedom of Movement', 'Destructive Wave', 'Hold Monster'],
        description: "A divine soldier. Extra weapon attacks as a Bonus Action, grant attack rerolls to allies, and gain resistance to physical damage at level 17.",
        features: [
          { level: 3, name: 'War Domain Spells', description: "Always prepared: Divine Favor, Shield of Faith; Magic Weapon, Spiritual Weapon; Crusader's Mantle, Spirit Guardians; Fire Shield, Freedom of Movement; Destructive Wave, Hold Monster.", isChoice: false },
          { level: 3, name: 'War Priest', description: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `When you take the Attack action, you can make one weapon attack as a Bonus Action. ${wis} use(s) per Long Rest (regain 1 on a Short Rest).`; }, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `When you take the Attack action on your turn, you can make one additional weapon attack as a Bonus Action. You can use this a number of times equal to your Wisdom modifier (currently ${wis}, minimum 1), regaining one use on a Short Rest and all on a Long Rest. It gives the War Cleric a martial cadence close to a Fighter's.`; }, isChoice: false },
          { level: 3, name: 'Guided Strike', description: "Channel Divinity: when you or a creature within 30 ft makes an attack roll, add +10 to it (decide after the roll, before the outcome).", descriptionLong: "When you make an attack roll, you can expend a use of Channel Divinity to gain a +10 bonus to that roll. You can decide to use it after seeing the d20 but before learning whether you hit. You can also grant this to another creature within 30 ft that you can see when it makes an attack roll. A near-guaranteed hit at a key moment.", isChoice: false },
          { level: 6, name: "War God's Blessing", description: "You can use Guided Strike to target a creature within 30 feet rather than yourself, without spending a Channel Divinity use.", isChoice: false },
          { level: 8, name: 'Divine Strike', description: "Once per turn when you hit with a weapon attack, deal an extra 1d8 damage of the same type as the weapon (2d8 at level 14).", isChoice: false },
          { level: 17, name: 'Avatar of Battle', description: "You gain Resistance to Bludgeoning, Piercing, and Slashing damage from nonmagical weapons.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Druid', hit_die: 8,
    primary_abilities: ['wisdom'],
    saving_throw_proficiencies: ['intelligence', 'wisdom'],
    skill_choices: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
    skill_count: 2,
    armor_proficiencies: ['Light Armor', 'Medium Armor', 'Shields (non-metal)'],
    weapon_proficiencies: ['Simple Weapons'],
    tool_proficiencies: ['Herbalism Kit'],
    is_spellcaster: true, spellcasting_ability: 'wisdom', spellcaster_type: 'full',
    subclasses: [
      {
        name: 'Circle of the Land', unlock_level: 3,
        description: "Draw power from your terrain. Recover spell slots on Short Rests, gain terrain-specific bonus spells, and eventually move through natural environments freely.",
        features: [
          { level: 3, name: 'Circle of the Land Spells', description: "Choose a terrain type (Arctic, Coast, Desert, Forest, Grassland, Mountain, Swamp, Underdark). Gain always-prepared spells for that terrain. Change terrain on Long Rest.", isChoice: true, choiceType: 'other' },
          { level: 3, name: 'Natural Recovery', description: (c) => `Once per day, when you finish a Short Rest, recover expended spell slots with a combined level up to ${Math.ceil(c.level/2)} (no slot above 5th). You also always have your circle spells prepared.`, descriptionLong: (c) => `When you finish a Short Rest, you can recover expended spell slots with a combined level equal to or less than half your Druid level, rounded up (currently ${Math.ceil(c.level/2)}), none higher than 5th level. Once per day. Your chosen terrain\u2019s Circle Spells are also always prepared and don\u2019t count against your prepared total.`, isChoice: false },
          { level: 6, name: "Land's Aid", description: "Bonus Action: expend one use of Wild Shape to call on the land. Until end of your next turn, gain Resistance to one damage type of your choice, and deal 1d8 Radiant or Necrotic damage to a creature within 60 feet.", isChoice: false },
          { level: 10, name: 'Natural Ward', description: "Immunity to Poison damage and the Poisoned condition. Resistance to the damage type associated with your chosen terrain.", isChoice: false },
          { level: 14, name: "Nature's Sanctuary", description: "Creatures of the natural world sense your connection. Animals and Plants have Disadvantage on attack rolls against you. A beast or plant creature must make a Wisdom save or choose a different target when attacking you.", isChoice: false },
        ],
      },
      {
        name: 'Circle of the Moon', unlock_level: 3,
        description: "Transform into more powerful beasts. Wild Shape CR scales with level, gain Temp HP equal to 3x Druid level, and eventually transform into Elementals.",
        features: [
          { level: 3, name: 'Circle Forms', description: (c) => `Wild Shape into beasts up to CR ${c.level >= 6 ? Math.floor(c.level/3) : 1}, and gain ${c.level >= 6 ? c.level * 4 : c.level * 3} Temporary HP each time you transform.`, descriptionLong: (c) => { const cr = c.level >= 6 ? Math.floor(c.level/3) : 1; const thp = c.level >= 6 ? c.level * 4 : c.level * 3; return `Your Wild Shape forms are mightier. You can transform into a Beast with a Challenge Rating as high as ${cr} (CR 1 at levels 3\u20135, then your Druid level divided by 3 from level 6 via Improved Circle Forms). Each time you assume a Wild Shape form, you gain Temporary Hit Points equal to ${c.level >= 6 ? '4' : '3'} \u00d7 your Druid level (currently ${thp}). This is what makes the Moon Druid a frontline brawler.`; }, isChoice: false },
          { level: 3, name: 'Combat Wild Shape', description: "Wild Shape as a Bonus Action. While transformed, use a Bonus Action to expend a spell slot and regain 1d8 Hit Points per level of the slot.", descriptionLong: `You can use Wild Shape as a Bonus Action rather than a Magic action. Additionally, while in a Wild Shape form, you can use a Bonus Action to expend a spell slot to regain 1d8 Hit Points per level of the slot expended. Together these let you shift into combat instantly and self-heal mid-fight without dropping form.`, isChoice: false },
          { level: 6, name: 'Improved Circle Forms', description: (c) => `Temp HP from Circle Forms rises to 4 \u00d7 your Druid level (currently ${c.level * 4}). You can also spend a use of Wild Shape to add your Wisdom modifier to a form\u2019s attack rolls.`, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `The Temporary Hit Points you gain from Circle Forms increase to four times your Druid level (currently ${c.level * 4}). In addition, while in a Wild Shape form you can add your Wisdom modifier (+${wis}) to the damage of your form\u2019s attacks by drawing on lunar power.`; }, isChoice: false },
          { level: 10, name: 'Elemental Wild Shape', description: "Expend two uses of Wild Shape simultaneously to transform into an Air Elemental, Earth Elemental, Fire Elemental, or Water Elemental.", isChoice: false },
          { level: 14, name: 'Thousand Forms', description: "You can cast Alter Self at will without expending a spell slot.", isChoice: false },
        ],
      },
      {
        name: 'Circle of the Sea', unlock_level: 3,
        description: "Channel the ocean's power. Your Wrath of the Sea aura deals Cold damage and pushes enemies; you gain aquatic abilities and can eventually fly while active.",
        features: [
          { level: 3, name: 'Wrath of the Sea', description: (c) => { const dice = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Bonus Action: summon a 5-ft Emanation of waves for 1 minute. Each enemy that ends its turn within 5 ft makes a Constitution save or takes ${dice}d6 Cold damage and is pushed up to 15 ft.`; }, descriptionLong: (c) => { const dice = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `As a Bonus Action, you manifest a 5-ft Emanation of crashing water around yourself for 1 minute (a number of times per Long Rest equal to your proficiency bonus). Once per turn when an enemy enters or ends its turn in the aura, it makes a Constitution saving throw, taking ${dice}d6 Cold damage (dice = your Wisdom modifier) on a failure and being pushed up to 15 ft away. At level 14 (Deep Conduction) a failed save also deals 2d8 Lightning.`; }, save: { ability: 'CON', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
          { level: 3, name: 'Aquatic Affinity', description: "Gain a Swim Speed equal to your Speed. You can breathe underwater.", isChoice: false },
          { level: 6, name: 'Stormborn', description: "While Wrath of the Sea is active, gain a Fly Speed equal to your Speed (hover). Advantage on saves against spells and effects that deal Lightning or Thunder damage.", isChoice: false },
          { level: 10, name: 'Oceanic Gift', description: "When you use Wrath of the Sea, one willing creature within 60 feet also gains its benefits (Swim Speed, water breathing, fly speed if Stormborn is active).", isChoice: false },
          { level: 14, name: 'Deep Conduction', description: "When a creature fails its save against Wrath of the Sea, it takes 2d8 extra Lightning damage. Creatures already in water have Disadvantage on the save.", isChoice: false },
        ],
      },
      {
        name: 'Circle of the Stars', unlock_level: 3,
        description: "Map the stars and channel their power. Starry Form grants three combat modes (Archer, Chalice, Dragon), and Cosmic Omen predicts fortune or misfortune.",
        features: [
          { level: 3, name: 'Star Map', description: (c) => `You carry a magical star map. You always have Guidance and Guiding Bolt prepared, and can cast Guiding Bolt ${Math.max(1, Math.floor((c.wisdom - 10)/2))} times per Long Rest without a slot.`, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `You create a star chart as a Tiny object that serves as a Spellcasting Focus for your Druid spells. While holding it, you always have the Guidance cantrip and the Guiding Bolt spell prepared, and you can cast Guiding Bolt without expending a spell slot a number of times equal to your Wisdom modifier (currently ${wis}, minimum 1), regaining all uses on a Long Rest.`; }, isChoice: false },
          { level: 3, name: 'Starry Form', description: "Bonus Action (expend Wild Shape): enter Starry Form for 10 min. Archer: Bonus Action ranged attack for 1d8 + Wis Radiant. Chalice: heal 1d8 + Wis when you cast a healing spell. Dragon: treat d20 rolls of 9 or lower as 10 on INT/WIS checks and Concentration.", descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `As a Bonus Action, you expend a use of Wild Shape to take on a luminous Starry Form for 10 minutes, choosing a constellation each time:\n\u2022 Archer \u2014 a Bonus Action ranged spell attack dealing 1d8 + your Wisdom modifier (+${wis}) Radiant damage.\n\u2022 Chalice \u2014 whenever you cast a spell with a slot to restore HP, you or another creature within 30 ft regains 1d8 + ${wis} HP.\n\u2022 Dragon \u2014 when you make an Intelligence or Wisdom check or a Concentration save, treat a d20 roll of 9 or lower as a 10.\nAt level 10 (Twinkling Constellations) Archer fires two beams and Chalice heals a second creature.`; }, isChoice: false },
          { level: 10, name: 'Twinkling Constellations', description: "Starry Form improvements: Archer fires 2 beams, Chalice heals a second creature, Dragon grants Fly Speed 20 ft. You can also switch Starry Form modes as a Bonus Action.", isChoice: false },
          { level: 14, name: 'Full of Stars', description: "While in Starry Form, you become partially incorporeal, granting Resistance to Bludgeoning, Piercing, and Slashing damage.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Fighter', hit_die: 10,
    primary_abilities: ['strength', 'dexterity'],
    saving_throw_proficiencies: ['strength', 'constitution'],
    skill_choices: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
    skill_count: 2,
    armor_proficiencies: ['All Armor', 'Shields'],
    weapon_proficiencies: ['Simple Weapons', 'Martial Weapons'],
    tool_proficiencies: [],
    is_spellcaster: false, spellcasting_ability: null, spellcaster_type: 'none',
    subclasses: [
      {
        name: 'Battle Master', unlock_level: 3,
        description: "Military expertise through Maneuvers. Spend Superiority Dice (d8s) to trip, disarm, rally, or enhance attacks. The most versatile and tactically deep Fighter subclass.",
        features: [
          { level: 3, name: 'Combat Superiority', description: (c) => { const die = c.level >= 18 ? 'd12' : c.level >= 10 ? 'd10' : 'd8'; const dice = c.level >= 15 ? 6 : c.level >= 7 ? 5 : 4; return `You have ${dice} Superiority Dice (${die}) that fuel Maneuvers. Maneuver save DC = 8 + proficiency + your Strength or Dexterity modifier. Regain all on a Short or Long Rest.`; }, descriptionLong: (c) => { const die = c.level >= 18 ? 'd12' : c.level >= 10 ? 'd10' : 'd8'; const dice = c.level >= 15 ? 6 : c.level >= 7 ? 5 : 4; return `You learn Maneuvers fueled by Superiority Dice. You have ${dice} dice, each a ${die} (d8 at levels 3\u20139, d10 at 10\u201317, d12 at 18+; 4 dice at 3\u20136, 5 at 7\u201314, 6 at 15+). You regain all expended dice on a Short or Long Rest. Maneuvers that force a save use a DC of 8 + your proficiency bonus + your Strength or Dexterity modifier (your choice).`; }, save: { ability: 'STR', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
          { level: 3, name: 'Maneuvers', description: "Choose 3 Maneuvers: Commander's Strike, Disarming Attack, Evasive Footwork, Feinting Attack, Goading Attack, Lunging Attack, Maneuvering Attack, Menacing Attack, Parry, Precision Attack, Pushing Attack, Rally, Riposte, Sweeping Attack, Trip Attack. Learn 2 more at levels 7, 10, and 15.", isChoice: true, choiceType: 'other', choiceCount: 3 },
          { level: 7, name: 'Know Your Enemy', description: "Bonus Action: Study a creature to learn two facts (AC, current HP, class levels, Str/Dex/Con relative to yours). Gain 2 more Maneuver choices.", isChoice: true, choiceType: 'other', choiceCount: 2 },
          { level: 10, name: 'Improved Combat Superiority', description: "Your Superiority Dice become d10s (and d12s at level 18). You also learn additional Maneuvers.", descriptionLong: "Your Superiority Dice increase in size to d10s at level 10 and to d12s at level 18 (Master of Combat Superiority). You also expand your repertoire of Maneuvers. Larger dice make every Maneuver \u2014 from Trip Attack to Riposte to Precision Attack \u2014 hit noticeably harder.", isChoice: false },
        ],
      },
      {
        name: 'Champion', unlock_level: 3,
        description: "Pure combat mastery through natural excellence. Critical hits on 19-20, then 18-20. Second Fighting Style. Eventually your survival instinct regenerates HP each turn.",
        features: [
          { level: 3, name: 'Improved Critical', description: "Your weapon attacks score a Critical Hit on a roll of 19 or 20.", descriptionLong: "Your weapon attacks score a Critical Hit on a d20 roll of 19 or 20, doubling your crit chance from 5% to 10%. At level 10 (Superior Critical) this widens to 18\u201320 (15%). More crits means more doubled damage dice over a fight \u2014 the Champion\u2019s core damage engine.", isChoice: false },
          { level: 3, name: 'Remarkable Athlete', description: (c) => { const half = Math.ceil(c.level >= 1 ? (c.level >= 17 ? 6 : c.level >= 13 ? 5 : c.level >= 9 ? 4 : c.level >= 5 ? 3 : 2) / 2 : 1); return `Add half your proficiency bonus (+${half}) to Strength, Dexterity, and Constitution checks that don't already use your proficiency, and your Initiative.`; }, descriptionLong: (c) => { const pb = c.level >= 17 ? 6 : c.level >= 13 ? 5 : c.level >= 9 ? 4 : c.level >= 5 ? 3 : 2; const half = Math.ceil(pb/2); return `You can add half your proficiency bonus, rounded up (currently +${half}), to any Strength, Dexterity, or Constitution check you make that doesn\u2019t already use your proficiency bonus. In addition, you have Advantage on Initiative rolls and on Strength (Athletics) checks. A broad athletic competence on top of your trained skills.`; }, isChoice: false },
          { level: 7, name: 'Additional Fighting Style', description: "Choose a second Fighting Style from the Fighter list.", isChoice: true, choiceType: 'fighting_style' },
          { level: 10, name: 'Superior Critical', description: "Your weapon attacks score a Critical Hit on a roll of 18, 19, or 20.", descriptionLong: "Your weapon attacks now score a Critical Hit on a d20 roll of 18\u201320, tripling your natural crit chance to 15%. Combined with high attack volume (and Action Surge), crits become a frequent, reliable damage spike.", isChoice: false },
          { level: 15, name: 'Survivor', description: "At the start of each of your turns, if you have at most half your Hit Points remaining, regain HP equal to 5 + your Constitution modifier. You don't gain this benefit if you have 0 HP.", isChoice: false },
        ],
      },
      {
        name: 'Eldritch Knight', unlock_level: 3,
        description: "Blend martial training with arcane spells. Bond weapons to your hand, use War Magic to attack after casting, and eventually cast instantly in reaction.",
        features: [
          { level: 3, name: 'Spellcasting', description: "Cast spells using the Wizard spell list (primarily Abjuration and Evocation). Intelligence is your spellcasting ability. One-third caster: 3 cantrips and 2 spell slots at level 3, scaling up to 4th-level slots at level 19.", isChoice: false },
          { level: 3, name: 'Weapon Bond', description: "Perform a 1-hour ritual to bond with up to two weapons. Bonded weapons can't be disarmed from you, and you can summon them to your empty hand as a Bonus Action.", isChoice: false },
          { level: 7, name: 'War Magic', description: "When you use your action to cast a cantrip, you can make one weapon attack as a Bonus Action.", isChoice: false },
          { level: 10, name: 'Eldritch Strike', description: "When you hit a creature with a weapon attack, it has Disadvantage on its next saving throw against a spell you cast before the end of your next turn.", descriptionLong: "When you hit a creature with a weapon attack, that creature has Disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn. This sets up your save-based spells (like a follow-up evocation) to land far more reliably \u2014 hit first, then blast.", isChoice: false },
          { level: 15, name: 'Arcane Charge', description: "When you use Action Surge, you can teleport up to 30 feet to an unoccupied space you can see, either before or after the extra action.", isChoice: false },
          { level: 18, name: 'Improved War Magic', description: "When you use your action to cast any spell (not just a cantrip), you can make one weapon attack as a Bonus Action.", isChoice: false },
        ],
      },
      {
        name: 'Psi Warrior', unlock_level: 3,
        description: "Augment attacks with psionic energy. Use Psionic Energy Dice to shove targets telekinetically, create psychic blades, protect yourself with force, and eventually read minds.",
        features: [
          { level: 3, name: 'Psionic Power', description: (c) => { const die = c.level >= 17 ? 'd12' : c.level >= 11 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; const pb = c.level >= 17 ? 6 : c.level >= 13 ? 5 : c.level >= 9 ? 4 : c.level >= 5 ? 3 : 2; return `You have ${pb * 2} Psionic Energy Dice (${die}). Spend them on Psi-Bolstered Knack (add a die to a failed skill check) and Psychic Whispers (telepathy). Regain 1 as a Bonus Action; all on a Long Rest.`; }, descriptionLong: (c) => { const die = c.level >= 17 ? 'd12' : c.level >= 11 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; const pb = c.level >= 17 ? 6 : c.level >= 13 ? 5 : c.level >= 9 ? 4 : c.level >= 5 ? 3 : 2; return `You have a pool of Psionic Energy Dice equal to twice your proficiency bonus (currently ${pb * 2}), each a ${die} (d6 at levels 3\u20134, d8 at 5\u201310, d10 at 11\u201316, d12 at 17+). Base powers:\n\u2022 Psi-Bolstered Knack \u2014 when you fail an ability check using a skill or tool proficiency, spend a die and add it; if you now succeed, the die isn't expended.\n\u2022 Psychic Whispers \u2014 establish telepathic communication with creatures you can see.\nYou regain one die as a Bonus Action (once per Short/Long Rest) and all dice on a Long Rest.`; }, isChoice: false },
          { level: 7, name: 'Telekinetic Adept', description: "Two new powers: Psi-Powered Leap (Bonus Action: gain Fly Speed = 2x walk until end of turn) and Telekinetic Thrust (on Psionic Strike hit, Str save or Prone/pushed 10 feet).", isChoice: false },
          { level: 10, name: 'Guarded Mind', description: "Resistance to Psychic damage. If you start your turn Charmed or Frightened, spend 1 Psionic Energy Die to end those conditions.", isChoice: false },
          { level: 15, name: 'Bulwark of Force', description: "Bonus Action (spend 1 Psionic Energy Die): you and creatures of your choice within 30 ft gain Half Cover for 1 minute (Concentration not required).", descriptionLong: "As a Bonus Action, you can spend one Psionic Energy Die to shield yourself and any creatures of your choice within 30 ft that you can see, granting them Half Cover (+2 AC and +2 to Dexterity saves) for 1 minute. You don\u2019t need to maintain Concentration. A strong party-wide defensive cooldown for a dangerous round.", isChoice: false },
          { level: 18, name: 'Telekinetic Master', description: "Cast Telekinesis without a spell slot once per Long Rest. While concentrating on it, make one weapon attack as a Bonus Action each turn.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Monk', hit_die: 8,
    primary_abilities: ['dexterity', 'wisdom'],
    saving_throw_proficiencies: ['strength', 'dexterity'],
    skill_choices: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'],
    skill_count: 2,
    armor_proficiencies: [],
    weapon_proficiencies: ['Simple Weapons', 'Martial Weapons with the Light property'],
    tool_proficiencies: ['One artisan tool or musical instrument of your choice'],
    is_spellcaster: false, spellcasting_ability: null, spellcaster_type: 'none',
    subclasses: [
      {
        name: 'Warrior of the Open Hand', unlock_level: 3,
        description: "The pure martial artist. Flurry of Blows can trip, push, or addle. Wholeness of Body self-heals. At level 17, Quivering Palm can kill at will.",
        features: [
          { level: 3, name: 'Open Hand Technique', description: "After hitting with Flurry of Blows, apply one effect per hit: Addle (no Reactions), Push (Strength save or shoved 15 ft), or Topple (Dexterity save or knocked Prone).", descriptionLong: "Whenever you hit a creature with one of the Unarmed Strikes granted by Flurry of Blows, you can impose one of these effects on that target:\n\u2022 Addle \u2014 the creature can\u2019t make Opportunity Attacks until the start of your next turn.\n\u2022 Push \u2014 the creature makes a Strength saving throw (against your Ki save DC) or is pushed up to 15 ft away.\n\u2022 Topple \u2014 the creature makes a Dexterity saving throw or has the Prone condition.\nThe save DC equals 8 + your proficiency bonus + your Wisdom modifier.", save: { ability: 'DEX', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
          { level: 6, name: 'Wholeness of Body', description: (c) => `Bonus Action: regain ${c.level * 3} Hit Points (three times your Monk level). Uses equal to your Wisdom modifier per Long Rest.`, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `As a Bonus Action, you can heal yourself for Hit Points equal to three times your Monk level (currently ${c.level * 3}). You can use this a number of times equal to your Wisdom modifier (${wis}, minimum 1), regaining all uses on a Long Rest. Self-sufficient sustain that keeps you in the fight.`; }, isChoice: false },
          { level: 11, name: 'Fleet Step', description: "When you take the Dash action as a Bonus Action, simultaneously take the Disengage action and gain +10 feet Speed until end of turn.", isChoice: false },
          { level: 17, name: 'Quivering Palm', description: "When you hit with an Unarmed Strike, spend 4 Focus Points to set up lethal vibrations. Later, as an action, force a Constitution save: failure drops the target to 0 HP, or takes 10d12 Force on a success.", descriptionLong: "When you hit a creature with an Unarmed Strike, you can spend 4 Focus Points to start imperceptible vibrations that last a number of days equal to your Monk level. While they persist, you can take a Magic action to end them: the target makes a Constitution saving throw against your Ki save DC. On a failure it drops to 0 Hit Points; on a success it takes 10d12 Force damage. You can have vibrations in only one creature at a time, and can end them harmlessly at will.", save: { ability: 'CON', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
        ],
      },
      {
        name: 'Warrior of Shadow', unlock_level: 3,
        description: "Meld with darkness. Cast Shadow Arts spells using Discipline Points, teleport between shadows, and become invisible in dim light.",
        features: [
          { level: 3, name: 'Shadow Arts', description: "Spend Discipline Points to cast: Darkness (2 pts), Darkvision (2 pts), Pass without Trace (3 pts), Silence (3 pts). Also know Minor Illusion cantrip for free. Wisdom is your spellcasting ability.", isChoice: false },
          { level: 6, name: 'Shadow Step', description: "When in Dim Light or Darkness, teleport to an unoccupied space within 60 feet that is also in Dim Light or Darkness. Gain Advantage on your next melee attack this turn.", isChoice: false },
          { level: 11, name: 'Improved Shadow Step', description: "Shadow Step no longer requires you to be in Dim Light or Darkness. You just need to see the destination space.", isChoice: false },
          { level: 17, name: 'Cloak of Shadows', description: "Magic action: spend 3 Discipline Points. Become Invisible until end of your next turn.", isChoice: false },
        ],
      },
      {
        name: 'Warrior of the Elements', unlock_level: 3,
        description: "Harness elemental power. Spend Discipline Points to attune to Air, Earth, Fire, or Water — each granting unique damage, movement, and combat effects.",
        features: [
          { level: 3, name: 'Elemental Attunement', description: "Start of turn: spend 1 Discipline Point to attune to an element for 10 minutes. Your melee attacks deal extra elemental damage. Air: move through creatures. Earth: ignore difficult terrain. Fire: +1 damage die. Water: Swim Speed = walk speed.", isChoice: true, choiceType: 'other' },
          { level: 6, name: 'Elemental Burst', description: (c) => { const die = c.level >= 17 ? 'd12' : c.level >= 11 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; return `While attuned, spend 2 Focus Points to create a 20-ft sphere within 120 ft. Each creature there makes a Dexterity save, taking your element's damage (number of Martial Arts dice, ${die}) \u2014 half on a success.`; }, descriptionLong: (c) => { const die = c.level >= 17 ? 'd12' : c.level >= 11 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; return `While attuned to an element, you can spend 2 Focus Points to unleash a 20-ft-radius sphere of elemental energy centered on a point within 120 ft. Each creature in the area makes a Dexterity saving throw against your Ki save DC, taking damage of your attuned element\u2019s type equal to a roll of your Martial Arts dice (${die}) on a failure, or half as much on a success. Your reliable ranged AoE.`; }, save: { ability: 'DEX', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
          { level: 11, name: 'Stride of the Elements', description: "While attuned to Air: Fly Speed = walk speed. Water: Swim Speed + water breathing. Earth: Burrow Speed 15 feet.", isChoice: false },
          { level: 17, name: 'Elemental Epitome', description: "While attuned, gain Resistance to your element's damage type. Spend 4 Discipline Points when using Flurry of Blows to deal maximum damage on each strike.", isChoice: false },
        ],
      },
      {
        name: 'Warrior of Mercy', unlock_level: 3,
        description: "Heal friends and harm foes with a touch. Hand of Harm and Hand of Healing let you combine martial strikes with potent medicine.",
        features: [
          { level: 3, name: 'Hand of Harm', description: (c) => { const die = c.level >= 17 ? 'd12' : c.level >= 11 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Once per turn when you hit with an Unarmed Strike, spend 1 Focus Point to deal extra Necrotic damage equal to one Martial Arts die (${die}) + your Wisdom modifier (+${wis}).`; }, descriptionLong: (c) => { const die = c.level >= 17 ? 'd12' : c.level >= 11 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Once per turn, when you hit a creature with an Unarmed Strike, you can spend 1 Focus Point to deal extra Necrotic damage equal to one roll of your Martial Arts die (${die}) plus your Wisdom modifier (+${wis}). Pairs with Hand of Healing as the two faces of the Mercy monk.`; }, isChoice: false },
          { level: 3, name: 'Hand of Healing', description: (c) => { const die = c.level >= 17 ? 'd12' : c.level >= 11 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Magic action: spend 1 Focus Point to touch a creature and restore HP equal to one Martial Arts die (${die}) + your Wisdom modifier (+${wis}).`; }, descriptionLong: (c) => { const die = c.level >= 17 ? 'd12' : c.level >= 11 ? 'd10' : c.level >= 5 ? 'd8' : 'd6'; const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `As a Magic action, you can spend 1 Focus Point to touch a creature and restore Hit Points equal to a roll of your Martial Arts die (${die}) plus your Wisdom modifier (+${wis}). From level 11 (Flurry of Healing and Harm) you can deliver Hand of Healing through Flurry of Blows strikes without spending additional Focus.`; }, isChoice: false },
          { level: 3, name: 'Implements of Mercy', description: "Gain proficiency in the Insight and Medicine skills and with the Herbalism Kit.", isChoice: false },
          { level: 6, name: "Physician's Touch", description: "Hand of Healing now also ends one disease or level of Exhaustion. Hand of Harm can now also make the target Poisoned until start of your next turn.", isChoice: false },
          { level: 11, name: 'Flurry of Healing and Harm', description: "When you use Flurry of Blows, replace any strikes with Hand of Healing (same cost per use). Hand of Harm no longer costs a Discipline Point when used as part of Flurry.", isChoice: false },
          { level: 17, name: 'Hand of Ultimate Mercy', description: "Magic action: spend 5 Discipline Points to touch a creature dead for no more than 24 hours. It returns to life with 4d10 + Wisdom modifier HP, clearing all conditions. Once per Long Rest.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Paladin', hit_die: 10,
    primary_abilities: ['strength', 'charisma'],
    saving_throw_proficiencies: ['wisdom', 'charisma'],
    skill_choices: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'],
    skill_count: 2,
    armor_proficiencies: ['All Armor', 'Shields'],
    weapon_proficiencies: ['Simple Weapons', 'Martial Weapons'],
    tool_proficiencies: [],
    is_spellcaster: true, spellcasting_ability: 'charisma', spellcaster_type: 'half',
    subclasses: [
      {
        name: 'Oath of Devotion', unlock_level: 3,
        spell_list: ['Protection from Evil and Good', 'Shield of Faith', 'Aid', 'Zone of Truth', 'Beacon of Hope', 'Dispel Magic', 'Freedom of Movement', 'Guardian of Faith', 'Commune', 'Flame Strike'],
        description: "The archetypal holy warrior. Sacred Weapon enchants your blade with Charisma. Aura of Devotion prevents Charm. At level 20, Holy Nimbus burns enemies with radiant sunlight.",
        features: [
          { level: 3, name: 'Oath of Devotion Spells', description: "Always prepared: Protection from Evil and Good, Shield of Faith; Aid, Zone of Truth; Beacon of Hope, Dispel Magic; Freedom of Movement, Guardian of Faith; Commune, Flame Strike.", isChoice: false },
          { level: 3, name: 'Sacred Weapon', description: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `Channel Divinity (Bonus Action): for 1 minute, add +${cha} (your Charisma modifier) to attack rolls with the weapon, which also emits Bright Light and deals Radiant damage.`; }, descriptionLong: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `As a Bonus Action, you expend a use of Channel Divinity to imbue one weapon you hold with positive energy for 1 minute. You add your Charisma modifier (currently +${cha}, minimum +1) to attack rolls made with it, and it deals Radiant damage instead of its normal type while emitting Bright Light in a 20-ft radius. You can end it early (no action).`; }, isChoice: false },
          { level: 3, name: 'Holy Rebuke', description: "Channel Divinity: when a creature within 30 feet damages you, use your Reaction to deal Radiant damage equal to 1d8 + Charisma modifier to the attacker.", isChoice: false },
          { level: 7, name: 'Aura of Devotion', description: (c) => { const r = c.level >= 18 ? 30 : 10; return `You and allies within ${r} ft can't be Charmed while you're conscious.`; }, descriptionLong: (c) => { const r = c.level >= 18 ? 30 : 10; return `While you're conscious, you and friendly creatures within ${r} ft of you can't be Charmed. If an ally is already Charmed, the condition is suspended while it's in the aura. The radius expands from 10 ft to 30 ft at level 18 (Aura improvements).`; }, isChoice: false },
          { level: 15, name: 'Smite of Protection', description: "Your Divine Smite can be used when you take damage, not just when you deal it. On use, gain resistance to all damage until the start of your next turn.", isChoice: false },
          { level: 20, name: 'Holy Nimbus', description: "Bonus Action: emit sunlight aura for 1 minute (30 ft Bright Light). Each hostile creature starting its turn in Bright Light takes 10 Radiant damage. Advantage on saves against Undead and Fiend spells. Once per Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'Oath of Glory', unlock_level: 3,
        spell_list: ['Guiding Bolt', 'Heroism', 'Enhance Ability', 'Magic Weapon', 'Haste', 'Protection from Energy', 'Compulsion', 'Freedom of Movement', 'Legend Lore'],
        description: "Inspire greatness in your allies. Aura of Alacrity grants bonus Speed to nearby allies. Channel Divinity distributes Temp HP or empowers athletic feats.",
        features: [
          { level: 3, name: 'Oath of Glory Spells', description: "Always prepared: Guiding Bolt, Heroism; Enhance Ability, Magic Weapon; Haste, Protection from Energy; Compulsion, Freedom of Movement; Legend Lore, Yolande's Regal Presence.", isChoice: false },
          { level: 3, name: 'Inspiring Smite', description: "After you deal damage with Divine Smite, use Channel Divinity as a Bonus Action. Distribute Temp HP equal to 2d8 + CHA mod among creatures within 30 feet (including yourself).", isChoice: false },
          { level: 3, name: 'Peerless Athlete', description: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `Channel Divinity (Bonus Action): for 1 hour, gain Advantage on Athletics and Acrobatics checks, +${cha} to long/high jumps, and can carry/lift double.`; }, descriptionLong: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `As a Bonus Action, you expend a use of Channel Divinity to augment your athleticism for 1 hour. You have Advantage on Strength (Athletics) and Dexterity (Acrobatics) checks, your jump distance increases by your Charisma modifier (+${cha}) feet, and your carrying/lifting capacity doubles.`; }, isChoice: false },
          { level: 7, name: 'Aura of Alacrity', description: (c) => { const r = c.level >= 18 ? 30 : 10; return `Your Speed increases by 10 ft. Allies who start their turn within ${r} ft gain +10 ft Speed until the end of that turn.`; }, descriptionLong: (c) => { const r = c.level >= 18 ? 30 : 10; return `Your Speed increases by 10 feet. Additionally, whenever a friendly creature starts its turn within ${r} ft of you, that creature's Speed increases by 10 feet until the end of that turn. The aura radius starts at 10 ft (allies must start adjacent-ish) and expands to 30 ft at level 18 \u2014 a powerful mobility engine for the whole party.`; }, isChoice: false },
          { level: 15, name: 'Glorious Defense', description: "When you or another creature within 10 feet is hit by an attack, use your Reaction to add your Charisma modifier to their AC for that attack. If it misses, make one weapon attack with Advantage against the attacker.", isChoice: false },
          { level: 20, name: 'Living Legend', description: "Bonus Action for 1 minute: Advantage on Charisma checks and saves; once per turn a missed attack becomes a hit; once per turn a failed save becomes a success. Once per Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'Oath of the Ancients', unlock_level: 3,
        spell_list: ['Ensnaring Strike', 'Speak with Animals', 'Misty Step', 'Moonbeam', 'Plant Growth', 'Protection from Energy', 'Ice Storm', 'Stoneskin', 'Commune with Nature', 'Tree Stride'],
        description: "Protect the light of life. Aura of Warding gives resistance to spell damage. Nature's Wrath restrains enemies. You stop aging and at level 15 you drop to 1 HP instead of 0.",
        features: [
          { level: 3, name: 'Oath of the Ancients Spells', description: "Always prepared: Ensnaring Strike, Speak with Animals; Misty Step, Moonbeam; Plant Growth, Protection from Energy; Ice Storm, Stoneskin; Commune with Nature, Tree Stride.", isChoice: false },
          { level: 3, name: "Nature's Wrath", description: "Channel Divinity: as a Magic action, magically bind a creature you can see within 10 feet. It makes a Strength or Dexterity save. On failure: Restrained until it succeeds on a repeated save at end of each of its turns.", isChoice: false },
          { level: 3, name: 'Turn the Faithless', description: "Channel Divinity (Magic action): each Fey and Fiend within 30 ft that can hear you makes a Wisdom save or is Turned (Frightened, must flee) for 1 minute. Illusions/disguises on them are also dispelled.", descriptionLong: "As a Magic action, you expend a use of Channel Divinity and present your holy symbol. Each Fey and Fiend within 30 ft that can hear you must make a Wisdom saving throw against your spell save DC. On a failure, the creature is Turned for 1 minute or until it takes damage \u2014 it must spend its turns trying to move away from you and can't willingly move closer. The radiant energy also reveals shapechangers and dispels illusions concealing such creatures.", save: { ability: 'WIS', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
          { level: 7, name: 'Aura of Warding', description: (c) => { const r = c.level >= 18 ? 30 : 10; return `You and allies within ${r} ft have Resistance to damage from spells.`; }, descriptionLong: (c) => { const r = c.level >= 18 ? 30 : 10; return `Ancient magic wards you: you and friendly creatures within ${r} ft of you have Resistance to damage from spells. This is one of the strongest defensive auras in the game against casters, halving the bulk of magical damage for your whole front line. Radius expands to 30 ft at level 18.`; }, isChoice: false },
          { level: 15, name: 'Undying Sentinel', description: "If reduced to 0 HP and not killed outright, drop to 1 HP instead. Once per Long Rest. You can't be aged magically, and you don't age.", isChoice: false },
          { level: 20, name: 'Elder Champion', description: "Bonus Action: become one with nature for 1 minute. Regenerate 10 HP at start of each turn; cast Ensnaring Strike as Bonus Action without slot; Advantage on saves. Once per Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'Oath of Vengeance', unlock_level: 3,
        spell_list: ['Bane', "Hunter's Mark", 'Hold Person', 'Misty Step', 'Haste', 'Protection from Energy', 'Banishment', 'Dimension Door', 'Hold Monster', 'Scrying'],
        description: "Hunt down evil relentlessly. Vow of Enmity grants Advantage against one target. Relentless Avenger lets you chase enemies who flee. Soul of Vengeance counters their every attack.",
        features: [
          { level: 3, name: 'Oath of Vengeance Spells', description: "Always prepared: Bane, Hunter's Mark; Hold Person, Misty Step; Haste, Protection from Energy; Banishment, Dimension Door; Hold Monster, Scrying.", isChoice: false },
          { level: 3, name: 'Vow of Enmity', description: "Channel Divinity (Bonus Action): mark a creature within 30 ft for 1 minute. You have Advantage on attack rolls against it for the duration (or until it drops).", descriptionLong: "As a Bonus Action, you expend a use of Channel Divinity to utter a vow of enmity against a creature you can see within 30 ft. You gain Advantage on attack rolls against that creature for 1 minute or until it drops to 0 Hit Points or falls Unconscious. Combined with Divine Smite, this near-guarantees your burst damage lands on a priority target.", isChoice: false },
          { level: 3, name: 'Abjure the Wretched', description: "Channel Divinity (Magic action): each Aberration, Fiend, and Undead within 30 ft makes a Wisdom save or is Frightened and Incapacitated for 1 minute, taking Radiant damage if it ends its turn near you.", descriptionLong: "As a Magic action, you expend a use of Channel Divinity. Each Aberration, Fiend, and Undead within 30 ft that can see or hear you must make a Wisdom saving throw against your spell save DC. On a failure, the creature has the Frightened and Incapacitated conditions for 1 minute. The effect ends on a creature if it takes any damage or if it ends its turn more than 30 ft from you.", save: { ability: 'WIS', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
          { level: 7, name: 'Relentless Avenger', description: "When you hit a creature with an Opportunity Attack, move up to half your Speed immediately after the attack without provoking Opportunity Attacks.", isChoice: false },
          { level: 15, name: 'Soul of Vengeance', description: "When a creature under your Vow of Enmity makes an attack, use your Reaction to make a melee weapon attack against it.", isChoice: false },
          { level: 20, name: 'Avenging Angel', description: "Bonus Action: sprout wings for 60 ft Fly Speed and create a 30-ft Aura of Menace for 1 minute. Hostile creatures in the aura make Wisdom saves or become Frightened with Speed 0. Once per Long Rest.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Ranger', hit_die: 10,
    primary_abilities: ['dexterity', 'wisdom'],
    saving_throw_proficiencies: ['strength', 'dexterity'],
    skill_choices: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
    skill_count: 3,
    armor_proficiencies: ['Light Armor', 'Medium Armor', 'Shields'],
    weapon_proficiencies: ['Simple Weapons', 'Martial Weapons'],
    tool_proficiencies: [],
    is_spellcaster: true, spellcasting_ability: 'wisdom', spellcaster_type: 'half',
    subclasses: [
      {
        name: 'Beast Master', unlock_level: 3,
        description: "Bond with a primal beast companion. Your Beast of the Land/Sea/Air fights alongside you, acts on your Initiative, and grows more powerful as you level.",
        features: [
          { level: 3, name: 'Primal Companion', description: (c) => `Summon a primal Beast (Land, Sea, or Air) that obeys your commands. Its AC, attack bonus, saves, skills, and damage add your proficiency bonus, and its HP = 5 \u00d7 your Ranger level (${c.level * 5}). It acts on your initiative.`, descriptionLong: (c) => { const pb = c.level >= 17 ? 6 : c.level >= 13 ? 5 : c.level >= 9 ? 4 : c.level >= 5 ? 3 : 2; return `As a Magic action you summon a spectral primal Beast \u2014 Beast of the Land, Sea, or Air \u2014 in an unoccupied space within 5 ft. It's friendly and obeys your commands. It shares your Initiative, adds your proficiency bonus (currently +${pb}) to its AC, attack rolls, damage, saving throws, and skill checks, and its Hit Point maximum equals 5 \u00d7 your Ranger level (${c.level * 5}). In combat it can take any action, but to have it Attack you use your Bonus Action to command it. If it drops to 0 HP you can revive it with a spell slot or by recasting after a rest.`; }, isChoice: false },
          { level: 7, name: 'Exceptional Training', description: "Bonus Action: command your companion to Dash, Disengage, or Help. Also, your companion's attacks count as magical for damage resistance.", isChoice: false },
          { level: 11, name: 'Bestial Fury', description: "When you command your companion to attack, it can make two attacks instead of one.", isChoice: false },
          { level: 15, name: 'Share Spells', description: "When you cast a spell targeting yourself, your companion can also be affected by it.", isChoice: false },
        ],
      },
      {
        name: 'Fey Wanderer', unlock_level: 3,
        description: "Channel fey magic to charm, terrify, and bend minds. Otherworldly Glamour enhances Charisma checks. Beguiling Twist redirects charm and fear effects onto new targets.",
        features: [
          { level: 3, name: 'Fey Wanderer Magic', description: "Always prepared: Charm Person; Misty Step; Dispel Magic; Dimension Door; Mislead.", isChoice: false },
          { level: 3, name: 'Otherworldly Glamour', description: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Add your Wisdom modifier (+${wis}, min +1) to every Charisma check. You also gain proficiency in one Charisma skill (Deception, Performance, or Persuasion).`; }, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Whenever you make a Charisma check, you add your Wisdom modifier to the roll (currently +${wis}, minimum +1) \u2014 making you surprisingly persuasive for a Ranger. You also gain proficiency in one of the following skills of your choice: Deception, Performance, or Persuasion.`; }, isChoice: false },
          { level: 7, name: 'Beguiling Twist', description: "When a creature within 120 feet succeeds on a save against being Charmed or Frightened, use your Reaction to force a different creature within 30 feet of the first to make a Wisdom save. On failure: Charmed or Frightened by you for 1 minute.", isChoice: false },
          { level: 11, name: 'Fey Reinforcements', description: "Cast Summon Fey once without a spell slot per Long Rest. Also expend a Ranger spell slot to cast it again.", isChoice: false },
          { level: 15, name: 'Misty Wanderer', description: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `Cast Misty Step without a spell slot ${wis} times per Long Rest (you can also bring a willing creature within 5 ft along).`; }, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); return `You can cast Misty Step without expending a spell slot a number of times equal to your Wisdom modifier (currently ${wis}, minimum 1), regaining all uses on a Long Rest. Whenever you cast it, you can also bring along one willing creature within 5 ft of you, teleporting it to an unoccupied space within 5 ft of your destination.`; }, isChoice: false },
        ],
      },
      {
        name: 'Gloom Stalker', unlock_level: 3,
        description: "Hunter of dark places. Invisible to darkvision, extra attacks and damage in the first combat round, and eventually immune to Frightened.",
        features: [
          { level: 3, name: 'Gloom Stalker Magic', description: "Always prepared: Disguise Self; Rope Trick; Fear; Greater Invisibility; Seeming.", isChoice: false },
          { level: 3, name: 'Dread Ambusher', description: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); const die = c.level >= 11 ? '2d6' : '1d6'; return `Add your Wisdom modifier (+${wis}) to Initiative. On your first turn of combat, your Speed +10 ft and you can make an extra weapon attack that deals an additional ${die} damage.`; }, descriptionLong: (c) => { const wis = Math.max(1, Math.floor((c.wisdom - 10)/2)); const die = c.level >= 11 ? '2d6' : '1d6'; return `You are a master of the first strike:\n\u2022 You add your Wisdom modifier (currently +${wis}) to your Initiative rolls.\n\u2022 On the first round of each combat, your Speed increases by 10 ft, and if you take the Attack action you can make one additional weapon attack. That attack deals an extra ${die} damage of the weapon's type (1d6 at levels 3\u201310, 2d6 at 11+). This makes a Gloom Stalker's opening turn one of the deadliest in the game.`; }, isChoice: false },
          { level: 3, name: 'Umbral Sight', description: "Gain Darkvision 60 ft (stacks with existing Darkvision). While in Darkness, you are Invisible to creatures relying on Darkvision.", isChoice: false },
          { level: 7, name: 'Iron Mind', description: "Gain proficiency in Wisdom saving throws. If already proficient, gain proficiency in Intelligence or Charisma saves instead.", isChoice: false },
          { level: 11, name: "Stalker's Flurry", description: "Once per turn when you miss an attack with a weapon, you can immediately make an extra attack with the same weapon. No action required.", isChoice: false },
          { level: 15, name: 'Shadowy Dodge', description: "When a creature attacks you, use your Reaction to impose Disadvantage on that attack roll. If it misses, move up to half your Speed without provoking Opportunity Attacks.", isChoice: false },
        ],
      },
      {
        name: 'Hunter', unlock_level: 3,
        description: "Adaptable predator. Choose from multiple offensive and defensive options at each tier — one of the most customizable and straightforward Ranger builds.",
        features: [
          { level: 3, name: "Hunter's Prey", description: "Choose one: Colossus Slayer (once/turn 1d8 extra against an already-injured target), Giant Killer (Reaction attack against Large+ creature that misses you), or Horde Breaker (extra attack against a second adjacent enemy).", isChoice: true, choiceType: 'other' },
          { level: 7, name: 'Defensive Tactics', description: "Choose one: Escape the Horde (Opportunity Attacks have Disadvantage against you), Multiattack Defense (+4 AC vs same creature after first attack), or Steel Will (Advantage on saves vs Frightened).", isChoice: true, choiceType: 'other' },
          { level: 11, name: 'Multiattack', description: "Choose one: Volley (action: ranged attack against each creature within 10 feet of a point within range) or Whirlwind Attack (action: melee attack against any number of adjacent creatures).", isChoice: true, choiceType: 'other' },
          { level: 15, name: "Superior Hunter's Defense", description: "Choose one: Evasion (succeed on Dex save = no damage, fail = half), Stand Against the Tide (when enemy melee misses you, redirect it to a different creature), or Uncanny Dodge (Reaction: halve damage from one attack).", isChoice: true, choiceType: 'other' },
        ],
      },
    ],
  },
  {
    name: 'Rogue', hit_die: 8,
    primary_abilities: ['dexterity'],
    saving_throw_proficiencies: ['dexterity', 'intelligence'],
    skill_choices: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Persuasion', 'Sleight of Hand', 'Stealth'],
    skill_count: 4,
    armor_proficiencies: ['Light Armor'],
    weapon_proficiencies: ['Simple Weapons', 'Hand Crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
    tool_proficiencies: ["Thieves' Tools"],
    is_spellcaster: false, spellcasting_ability: null, spellcaster_type: 'none',
    subclasses: [
      {
        name: 'Arcane Trickster', unlock_level: 3,
        description: "Blend thievery with arcane magic. Invisible Mage Hand picks pockets at range. Magical Ambush imposes Disadvantage on spell saves when you're hidden.",
        features: [
          { level: 3, name: 'Spellcasting', description: "Cast Wizard spells (primarily Enchantment and Illusion). Intelligence is your spellcasting ability. One-third caster: 3 cantrips, 2 spell slots at level 3, scaling up to 4th-level slots at level 19. Mage Hand is always known.", isChoice: false },
          { level: 3, name: 'Mage Hand Legerdemain', description: "Your Mage Hand is Invisible. Use it to pick locks, disarm traps, or pick pockets (using your Sleight of Hand) as part of the hand's movement. Control it as a Bonus Action.", isChoice: false },
          { level: 9, name: 'Magical Ambush', description: "When you are Hidden from a creature when you cast a spell on it, that creature has Disadvantage on saving throws against the spell this turn.", isChoice: false },
          { level: 13, name: 'Versatile Trickster', description: "Bonus Action: designate a creature within 5 feet of your Mage Hand. You have Advantage on attack rolls against that creature until the end of the turn.", isChoice: false },
          { level: 17, name: 'Spell Thief', description: "After a creature casts a spell targeting you, use your Reaction to make an Arcana check (DC 10 + spell's level). On success: steal the spell — they can't cast it again until a Long Rest, and you can cast it once using an appropriate slot.", isChoice: false },
        ],
      },
      {
        name: 'Assassin', unlock_level: 3,
        description: "Master of surprise. Automatic Critical Hits on Surprised creatures. Create flawless false identities. Death Strike doubles damage on Surprised targets.",
        features: [
          { level: 3, name: 'Assassinate', description: "You have Advantage on attacks against any creature that hasn't taken a turn yet. Any hit against a Surprised creature is a Critical Hit.", descriptionLong: "You're deadliest at the start of a fight. During the first round of any combat, you have Advantage on attack rolls against any creature that hasn't taken a turn yet. In addition, any hit you score against a creature that is Surprised is a Critical Hit. Pairing this with a guaranteed Sneak Attack on the opening turn produces enormous burst damage.", isChoice: false },
          { level: 3, name: "Assassin's Tools", description: "Gain proficiency with the Disguise Kit and Poisoner's Kit.", isChoice: false },
          { level: 9, name: 'Infiltration Expertise', description: "During a Short Rest, create an alternate identity: documents, false occupation, backstory. NPCs who interact with you over several days believe the identity completely.", isChoice: false },
          { level: 13, name: 'Envenom Weapons', description: "When you coat a weapon with poison using your Poisoner's Kit, the poison retains potency for 1 hour instead of 1 minute. Add your Proficiency Bonus to your poison save DC.", isChoice: false },
          { level: 17, name: 'Death Strike', description: "When you hit a Surprised creature with an attack, it makes a Constitution save (DC 8 + Dex mod + proficiency) or takes double damage from the attack.", descriptionLong: "When you hit a creature that is Surprised with an attack roll on your first turn of combat, the creature makes a Constitution saving throw (DC 8 + your Dexterity modifier + your proficiency bonus). On a failed save, you double the damage of that attack against the target. Combined with Assassinate's Advantage and an automatic critical setup, this can end a fight in a single opening strike.", save: { ability: 'CON', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
        ],
      },
      {
        name: 'Soulknife', unlock_level: 3,
        description: "Manifest psychic blades from pure thought. Psionic Energy Dice power telepathy, psychic teleportation, and a Psychic Veil of invisibility.",
        features: [
          { level: 3, name: 'Psionic Power', description: "Gain Psionic Energy Dice (d6s = twice Proficiency Bonus). Powers: Psychic Whispers (spend 1 die to establish telepathy with up to Proficiency Bonus creatures for 1 hour) and Psychic Blades enhancement.", isChoice: false },
          { level: 3, name: 'Psychic Blades', description: (c) => { const main = c.level >= 17 ? '1d8' : '1d6'; return `Manifest a Psychic Blade as part of an attack (Finesse, ${main} Psychic, thrown 60 ft, no resource). After attacking, make a second blade attack as a Bonus Action dealing 1d6 Psychic.`; }, descriptionLong: (c) => { const main = c.level >= 17 ? '1d8' : '1d6'; return `Whenever you take the Attack action, you can manifest a shimmering Psychic Blade and attack with it: it's a Simple Melee weapon with the Finesse and Thrown (range 60/120) properties that deals ${main} Psychic damage on a hit (main blade upgrades to 1d8 at level 17 via Rend Mind tier). Immediately after attacking with it, you can make a second Psychic Blade attack as a Bonus Action, dealing 1d6 Psychic. The blades require no ammunition and vanish after the attack \u2014 you always have a finesse weapon and a ranged option ready for Sneak Attack.`; }, isChoice: false },
          { level: 9, name: 'Soul Blades', description: "New powers: Homing Strikes (after missing, spend 1 die to reroll with the die result as a bonus), Psychic Teleportation (Bonus Action: spend 1 die, teleport up to 10 times the die roll in feet).", isChoice: false },
          { level: 13, name: 'Psychic Veil', description: "Spend 1 Psionic Energy Die to become Invisible for 1 hour or until you attack or cast a spell. Once per Long Rest (or spend an extra die to use again).", isChoice: false },
          { level: 17, name: 'Rend Mind', description: "When you deal Sneak Attack damage with a Psychic Blade, you can force the target to make a Wisdom save or be Stunned for 1 minute (repeats the save at the end of each of its turns).", descriptionLong: "When you deal Sneak Attack damage to a creature with your Psychic Blades, you can force that target to make a Wisdom saving throw against a DC of 8 + your proficiency bonus + your Dexterity modifier. On a failure, the creature has the Stunned condition for 1 minute. It repeats the save at the end of each of its turns, ending the effect on a success. Once used, you must spend 3 Psionic Energy Dice to use it again before a Long Rest.", save: { ability: 'WIS', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
        ],
      },
      {
        name: 'Thief', unlock_level: 3,
        description: "The ultimate infiltrator. Fast Hands uses object interactions as a Bonus Action. Second Story Work grants Climb Speed. At level 13 you can use any magic item.",
        features: [
          { level: 3, name: 'Fast Hands', description: "Use Sleight of Hand, Thieves' Tools, Disguise Kit, and Forgery Kit as a Bonus Action. Also, take the Use an Object action as a Bonus Action.", isChoice: false },
          { level: 3, name: 'Second Story Work', description: "Gain a Climb Speed equal to your Speed. When you jump, add your Dexterity modifier to the distance in feet you can long or high jump.", isChoice: false },
          { level: 9, name: 'Supreme Sneak', description: "Advantage on Dexterity (Stealth) checks when you move no more than half your Speed on the same turn. Also attempt to hide as a Bonus Action after using Dash or Disengage.", isChoice: false },
          { level: 13, name: 'Use Magic Device', description: "You can use any magic item (except Artifacts) regardless of class, race, or other requirements — even those that normally require attunement by a specific class.", isChoice: false },
          { level: 17, name: "Thief's Reflexes", description: "Take two turns during the first round of combat. First turn at your normal Initiative, second turn at Initiative minus 10.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Sorcerer', hit_die: 6,
    primary_abilities: ['charisma'],
    saving_throw_proficiencies: ['constitution', 'charisma'],
    skill_choices: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'],
    skill_count: 2,
    armor_proficiencies: [],
    weapon_proficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light Crossbows'],
    tool_proficiencies: [],
    is_spellcaster: true, spellcasting_ability: 'charisma', spellcaster_type: 'full',
    subclasses: [
      {
        name: 'Aberrant Sorcery', unlock_level: 3,
        description: "Your magic comes from exposure to Far Realm energy. Cast psionic spells for free using Sorcery Points instead of spell slots, and project psychic screams.",
        features: [
          { level: 3, name: 'Aberrant Sorcery Spells', description: "Always prepared: Arms of Hadar, Dissonant Whispers; Calm Emotions, Detect Thoughts; Hunger of Hadar, Sending; Compulsion, Evard's Black Tentacles; Modify Memory, Rary's Telepathic Bond.", isChoice: false },
          { level: 3, name: 'Telepathic Speech', description: (c) => `Bonus Action: form a telepathic link with a creature within 30 ft for ${c.level} minutes (your Sorcerer level). You can speak telepathically while within 1 mile of each other.`, descriptionLong: (c) => `As a Bonus Action, you can choose one creature you can see within 30 ft and form a telepathic connection that lasts a number of minutes equal to your Sorcerer level (currently ${c.level}), or until you use this feature again. While linked and within 1 mile of each other, you and the creature can communicate telepathically in a language you both know. You don't need to share a language for the creature to understand you, but it must understand at least one language.`, isChoice: false },
          { level: 6, name: 'Psionic Sorcery', description: "When you cast any level 1+ spell from your Aberrant Sorcery Spells list, you can spend Sorcery Points equal to the spell's level instead of expending a spell slot. If you do, the spell requires no Verbal or Somatic components (and no Material unless consumed or costly).", isChoice: false },
          { level: 6, name: 'Psychic Defenses', description: "You have Resistance to Psychic damage. You have Advantage on saving throws against the Charmed and Frightened conditions.", isChoice: false },
          { level: 14, name: 'Revelation in Flesh', description: "Bonus Action: spend 1-4 Sorcery Points to transform for 10 minutes. Each point grants one benefit: Swim Speed + water breathing; Fly Speed = walk speed (hover); Darkvision 60 ft; move through creatures and objects as Difficult Terrain. Once per Long Rest.", isChoice: true, choiceType: 'other' },
          { level: 18, name: 'Warping Implosion', description: "Teleport up to 120 feet. Each creature within 30 feet of your origin must make a Strength save: fail = 3d10 Force damage and pulled 30 feet toward you; success = half damage only. Once per Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'Clockwork Sorcery', unlock_level: 3,
        description: "Channel the order of Mechanus. Cancel Advantage and Disadvantage on rolls, create damage-absorbing shields using Sorcery Points, and enforce cosmic law.",
        features: [
          { level: 3, name: 'Clockwork Sorcery Spells', description: "Always prepared: Alarm, Protection from Evil and Good; Aid, Lesser Restoration; Dispel Magic, Protection from Energy; Freedom of Movement, Summon Construct; Greater Restoration, Wall of Force.", isChoice: false },
          { level: 3, name: 'Restore Balance', description: "Reaction: when a creature within 60 feet is about to roll with Advantage or Disadvantage, cancel that effect for that roll. Usable Proficiency Bonus times per Long Rest.", isChoice: false },
          { level: 6, name: 'Bastion of Law', description: "Magic action: spend 1-5 Sorcery Points to create a magical ward on a creature within 30 feet. The ward has d8s equal to points spent. When the warded creature takes damage, expend dice to reduce damage by that amount.", isChoice: false },
          { level: 14, name: 'Trance of Order', description: "Bonus Action: enter a trance for 1 minute. Your attack rolls can't suffer Disadvantage; creatures can't have Advantage on attacks against you; roll 9 or lower on a d20 Test = treat as 10. Once per Long Rest.", isChoice: false },
          { level: 18, name: 'Clockwork Cavalcade', description: "Magic action: call on Mechanus to restore balance. All chosen creatures in a 30-foot Cube originating from you regain 3d10 HP and have all negative conditions (Blinded, Charmed, Deafened, Frightened, Paralyzed, Poisoned) removed. Once per Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'Draconic Sorcery', unlock_level: 3,
        description: "Born of dragon blood. Gain extra HP, natural armor from Charisma, add Charisma to elemental damage, and eventually sprout wings to fly.",
        features: [
          { level: 3, name: 'Draconic Resilience', description: (c) => `Your HP maximum increases by ${c.level} (3 at level 3, +1 per Sorcerer level after). While you aren't wearing armor, your base AC equals 10 + Dex mod + your Charisma modifier.`, descriptionLong: (c) => { const cha = Math.max(0, Math.floor((c.charisma - 10)/2)); const hp = c.level; return `Draconic magic toughens you. Your Hit Point maximum increases by ${hp} (3 at level 3, plus 1 for each Sorcerer level after \u2014 currently ${hp}). Additionally, while you aren't wearing armor, your base AC equals 10 + your Dexterity modifier + your Charisma modifier (+${cha}), letting you build toward a high natural AC like a true dragon.`; }, isChoice: false },
          { level: 3, name: 'Draconic Lineage', description: "Choose a dragon type (Black, Blue, Brass, Bronze, Copper, Gold, Green, Red, Silver, White). Gain Draconic language and Resistance to the associated damage type.", isChoice: true, choiceType: 'other' },
          { level: 6, name: 'Elemental Affinity', description: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `When you cast a spell that deals damage of your dragon's element, add your Charisma modifier (+${cha}) to one damage roll. You can also spend 1 Sorcery Point to gain Resistance to that damage type for 1 hour.`; }, descriptionLong: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `When you cast a spell that deals damage of the type associated with your Draconic Lineage, you can add your Charisma modifier (currently +${cha}) to one damage roll of that spell. At the same time, you can spend 1 Sorcery Point to gain Resistance to that damage type for 1 hour. This makes your signature element noticeably harder-hitting and gives you on-demand defensive scaling.`; }, isChoice: false },
          { level: 14, name: 'Dragon Wings', description: "Bonus Action: sprout wings and gain a Fly Speed equal to your current walking Speed until you dismiss them. You can't be wearing armor that lacks an opening for them.", descriptionLong: "As a Bonus Action, you can sprout a pair of dragon wings from your back, gaining a Fly Speed equal to your current walking Speed. The wings last until you dismiss them (no action). You can't manifest them while wearing armor unless the armor is made to accommodate them. Persistent, no-resource flight from level 14 onward is a major mobility and positioning advantage.", isChoice: false },
          { level: 18, name: 'Draconic Presence', description: "Magic action: spend 5 Sorcery Points to emanate an aura of awe or fear (60 ft) for 1 minute. Each enemy that starts its turn there makes a Wisdom save or is Charmed (awe) or Frightened (fear).", descriptionLong: "As a Magic action, you can spend 5 Sorcery Points to draw on the majesty of dragons, creating a 60-ft Emanation of awe or fear (your choice) for 1 minute (Concentration). Each hostile creature that starts its turn in the aura must succeed on a Wisdom saving throw against your spell save DC or have the Charmed condition (if you chose awe) or the Frightened condition (if you chose fear) until the aura ends. A creature that succeeds is immune to this aura for 24 hours.", save: { ability: 'WIS', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
        ],
      },
      {
        name: 'Wild Magic Sorcery', unlock_level: 3,
        description: "Raw magic surges through you unpredictably. Wild Magic Surges create chaotic effects. Tides of Chaos grants Advantage. Eventually you can control the chaos.",
        features: [
          { level: 3, name: 'Wild Magic Surge', description: "After casting a level 1+ spell, the DM can have you roll a d20. On a 1: roll on the Wild Magic Surge table (1d100) to produce a random magical effect — from a centered Fireball to summoning a flumph.", isChoice: false },
          { level: 3, name: 'Tides of Chaos', description: "Once per Long Rest, gain Advantage on one d20 Test (attack roll, ability check, or saving throw). The DM may trigger a Wild Magic Surge afterward, which also restores this use.", descriptionLong: "You can manipulate the chaos of magic to give yourself Advantage on one attack roll, ability check, or saving throw of your choice. Once you do, you must finish a Long Rest before using it again \u2014 unless, before then, you cast a Sorcerer spell of level 1+ and the DM has you roll on the Wild Magic Surge table, which immediately restores this use. From level 3 you can also trigger your own Surge by spending the use.", isChoice: false },
          { level: 6, name: 'Bend Luck', description: "Reaction (spend 2 Sorcery Points): when another creature you can see makes an attack roll, ability check, or saving throw, roll 1d4 and apply it as a bonus or penalty to that roll.", descriptionLong: "When another creature you can see makes an attack roll, an ability check, or a saving throw, you can use your Reaction and spend 2 Sorcery Points to roll 1d4. You apply the number rolled as a bonus or penalty (your choice) to the creature's roll. You can do this after the roll but before its effects are resolved \u2014 a flexible tool to rescue an ally's save or spoil an enemy's attack.", isChoice: false },
          { level: 14, name: 'Controlled Chaos', description: "When you roll on the Wild Magic Surge table, roll twice and choose which result applies.", isChoice: false },
          { level: 18, name: 'Spell Bombardment', description: "When you roll damage for a spell and any die shows its highest possible result, choose one of those dice, roll it again, and add it to the damage total.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Warlock', hit_die: 8,
    primary_abilities: ['charisma'],
    saving_throw_proficiencies: ['wisdom', 'charisma'],
    skill_choices: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'],
    skill_count: 2,
    armor_proficiencies: ['Light Armor'],
    weapon_proficiencies: ['Simple Weapons'],
    tool_proficiencies: [],
    is_spellcaster: true, spellcasting_ability: 'charisma', spellcaster_type: 'warlock',
    subclasses: [
      {
        name: 'Archfey Patron', unlock_level: 3,
        description: "A powerful Fey lord grants glamour and trickery. Free Misty Steps with bonus effects, escape via invisibility, and eventually bewilder attackers with your fey majesty.",
        features: [
          { level: 3, name: 'Archfey Spells', description: "Always prepared: Faerie Fire, Sleep; Calm Emotions, Phantasmal Force; Blink, Plant Growth; Dominate Beast, Greater Invisibility; Dominate Person, Seeming.", isChoice: false },
          { level: 3, name: 'Steps of the Fey', description: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `Cast Misty Step without a spell slot ${cha} times per Long Rest. Each casting also triggers a benefit: Refreshing Step (you or an ally gains temp HP) or Taunting Step (a creature has Disadvantage on attacks against others).`; }, descriptionLong: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `You can cast Misty Step without expending a spell slot a number of times equal to your Charisma modifier (currently ${cha}, minimum 1), regaining all uses on a Long Rest. Whenever you cast it this way, you choose one additional effect:\n\u2022 Refreshing Step \u2014 immediately after teleporting, you or one creature within 10 ft gains Temporary Hit Points equal to 1d10 + your Warlock level.\n\u2022 Taunting Step \u2014 creatures within 5 ft of your departure space have Disadvantage on attack rolls against creatures other than you until the start of your next turn.`; }, isChoice: false },
          { level: 6, name: 'Misty Escape', description: "When you take damage, use your Reaction to cast Misty Step without a slot and become Invisible until start of your next turn (or until you attack or cast). Once per Short or Long Rest.", isChoice: false },
          { level: 10, name: 'Beguiling Defenses', description: "You can't be Charmed while Conscious. When a creature tries to Charm you, use your Reaction to force it to make a Wisdom save — on failure it's Charmed by you for 1 minute.", isChoice: false },
          { level: 14, name: 'Bewitching Magic', description: "When you cast a level 1+ Warlock spell with a slot, cast Confusion or a Charm-type spell as a Bonus Action using a slot. Once per Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'Celestial Patron', unlock_level: 3,
        description: "A powerful celestial grants healing power. Use Healing Light dice to restore HP, always have Sacred Flame, and at level 14 prevent a nearby creature from dropping to 0 HP.",
        features: [
          { level: 3, name: 'Celestial Spells', description: "Always prepared: Cure Wounds, Guiding Bolt; Flaming Sphere, Lesser Restoration; Daylight, Revivify; Guardian of Faith, Wall of Fire; Flame Strike, Greater Restoration.", isChoice: false },
          { level: 3, name: 'Healing Light', description: (c) => `Gain a pool of ${1 + c.level}d6 (1 + your Warlock level). Bonus Action: spend dice to heal a creature within 60 ft. Regain all on a Long Rest.`, descriptionLong: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `You have a pool of d6s equal to 1 + your Warlock level (currently ${1 + c.level} dice). As a Bonus Action, you can heal a creature you can see within 60 ft, spending up to ${cha} dice from the pool at once (a number equal to your Charisma modifier, minimum 1) and restoring HP equal to the dice rolled. The pool refreshes on a Long Rest.`; }, isChoice: false },
          { level: 6, name: 'Radiant Soul', description: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `You have Resistance to Radiant damage. Once per turn when you cast a spell dealing Radiant or Fire damage, add your Charisma modifier (+${cha}) to one damage roll.`; }, descriptionLong: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `Your link to your celestial patron grants you Resistance to Radiant damage. In addition, once on each of your turns when you cast a spell that deals Radiant or Fire damage, you can add your Charisma modifier (currently +${cha}) to one of that spell's damage rolls against one of its targets.`; }, isChoice: false },
          { level: 10, name: 'Celestial Resilience', description: (c) => { const cha = Math.max(0, Math.floor((c.charisma - 10)/2)); return `When you finish a Short or Long Rest, you gain Temp HP equal to ${c.level + cha} (your Warlock level + Charisma modifier); up to 5 chosen allies gain half that.`; }, descriptionLong: (c) => { const cha = Math.max(0, Math.floor((c.charisma - 10)/2)); const half = Math.floor((c.level + cha)/2); return `Whenever you finish a Short or Long Rest, you gain Temporary Hit Points equal to your Warlock level + your Charisma modifier (currently ${c.level + cha}). Additionally, choose up to five creatures you can see at the end of the rest; each gains Temporary Hit Points equal to half that amount (${half}). A reliable party-wide buffer entering each fight.`; }, isChoice: false },
          { level: 14, name: 'Searing Vengeance', description: "When you or an ally within 60 feet would drop to 0 HP, use your Reaction to restore them to half HP and deal 2d8 + CHA Radiant damage to each enemy within 30 feet. Once per Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'Fiend Patron', unlock_level: 3,
        description: "A powerful devil or demon grants resilience and fire. Kill for Temporary HP. Fiendish Resilience grants ongoing damage resistance. At level 14, hurl enemies to the lower planes.",
        features: [
          { level: 3, name: 'Fiend Spells', description: "Always prepared: Burning Hands, Command; Blindness/Deafness, Scorching Ray; Fireball, Stinking Cloud; Fire Shield, Wall of Fire; Flame Strike, Hallow.", isChoice: false },
          { level: 3, name: "Dark One's Blessing", description: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `When you reduce an enemy to 0 HP, gain ${cha + c.level} Temporary HP (Charisma modifier + Warlock level). While you have them, you can't be Charmed or Frightened.`; }, descriptionLong: (c) => { const cha = Math.max(1, Math.floor((c.charisma - 10)/2)); return `When you reduce an enemy to 0 Hit Points, you gain Temporary Hit Points equal to your Charisma modifier + your Warlock level (currently ${cha + c.level}, minimum 1). While you have any of these Temporary Hit Points, you can't be Charmed or Frightened. Every kill tops you back up and steadies your mind.`; }, isChoice: false },
          { level: 6, name: "Dark One's Own Luck", description: "When you make an ability check or saving throw, add 1d10 to the roll. Proficiency Bonus times per Long Rest.", isChoice: false },
          { level: 10, name: 'Fiendish Resilience', description: "After finishing a Short or Long Rest, choose one damage type (not Psychic or Poison). Gain Resistance to that type until you choose a different one.", isChoice: false },
          { level: 14, name: 'Hurl Through Hell', description: "When you hit a creature with an attack, cast them into the lower planes momentarily. The creature disappears until end of your next turn, then returns and takes 10d10 Psychic damage (Undead are immune). Once per Long Rest.", isChoice: false },
        ],
      },
      {
        name: 'Great Old One Patron', unlock_level: 3,
        description: "An alien consciousness grants telepathy and psychic power. Cast Detect Thoughts for free, gain psychic defenses, and eventually dominate the minds of others.",
        features: [
          { level: 3, name: 'Great Old One Spells', description: "Always prepared: Dissonant Whispers, Hideous Laughter; Detect Thoughts, Phantasmal Force; Hunger of Hadar, Sending; Compulsion, Evard's Black Tentacles; Dominate Monster, Telekinesis.", isChoice: false },
          { level: 3, name: 'Awakened Mind', description: "You can telepathically speak to any creature you can see within 30 ft. It understands you only if you share a language, but you don't need to speak aloud.", descriptionLong: "Using a Bonus Action, you can telepathically link with one creature you can see within 30 ft. Until the link ends, you can communicate telepathically with each other while within 30 ft. The creature understands you only if you share a language. This costs no resource and is invaluable for silent coordination, infiltration, and parley.", isChoice: false },
          { level: 6, name: 'Psychic Defenses', description: "Resistance to Psychic damage. Advantage on saving throws against the Charmed and Frightened conditions.", isChoice: false },
          { level: 10, name: 'Clairvoyant Combatant', description: "When you force a creature to make a saving throw from a spell or feature, impose Disadvantage on the roll. Once per Short or Long Rest.", isChoice: false },
          { level: 14, name: 'Create Thrall', description: "When you cast Dominate Monster and the target fails its save, it becomes a Thrall: immune to Charmed condition, doesn't make saves to end Dominate Monster. Bonus Action: force it to use its Reaction to move or make one weapon attack. Once per Long Rest.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Wizard', hit_die: 6,
    primary_abilities: ['intelligence'],
    saving_throw_proficiencies: ['intelligence', 'wisdom'],
    skill_choices: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'],
    skill_count: 2,
    armor_proficiencies: [],
    weapon_proficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light Crossbows'],
    tool_proficiencies: [],
    is_spellcaster: true, spellcasting_ability: 'intelligence', spellcaster_type: 'full',
    subclasses: [
      {
        name: 'Abjurer', unlock_level: 3,
        description: "Master of protective magic. Build an Arcane Ward that absorbs damage, share it with allies via Projected Ward, and eventually resist all spells.",
        features: [
          { level: 3, name: 'Abjuration Savant', description: "Gold and time to copy Abjuration spells into your spellbook is halved.", isChoice: false },
          { level: 3, name: 'Arcane Ward', description: (c) => { const intm = Math.max(0, Math.floor((c.intelligence - 10)/2)); return `When you cast an Abjuration spell of level 1+, create a magical ward with ${c.level * 2 + intm} HP (2 \u00d7 Wizard level + Intelligence modifier). It absorbs damage you take until depleted.`; }, descriptionLong: (c) => { const intm = Math.max(0, Math.floor((c.intelligence - 10)/2)); return `The first time each turn you cast an Abjuration spell of level 1+ while the ward is down, you create an Arcane Ward with a Hit Point maximum equal to twice your Wizard level + your Intelligence modifier (currently ${c.level * 2 + intm}). Whenever you take damage, the ward takes it instead, and casting further Abjuration spells recharges it (2 HP per slot level). The ward lasts until you finish a Long Rest. A near-permanent damage buffer that makes the Abjurer extremely durable.`; }, isChoice: false },
          { level: 6, name: 'Projected Ward', description: "When a creature within 30 feet takes damage, use your Reaction to make your Arcane Ward absorb that damage instead.", isChoice: false },
          { level: 10, name: 'Improved Abjuration', description: (c) => { const pb = c.level >= 17 ? 6 : c.level >= 13 ? 5 : 4; return `When you cast an Abjuration spell requiring an ability check as part of casting (e.g. Counterspell, Dispel Magic), add your proficiency bonus (+${pb}) to that check.`; }, descriptionLong: (c) => { const pb = c.level >= 17 ? 6 : c.level >= 13 ? 5 : 4; return `When you cast an Abjuration spell that requires you to make an ability check as part of casting it \u2014 such as the check for Counterspell or Dispel Magic against a higher-level spell \u2014 you add your proficiency bonus (currently +${pb}) to that ability check, making your counter-magic far more reliable.`; }, isChoice: false },
          { level: 14, name: 'Spell Resistance', description: "Advantage on saving throws against spells. Resistance to the damage of spells.", isChoice: false },
        ],
      },
      {
        name: 'Diviner', unlock_level: 3,
        description: "See what others cannot. Pre-roll Portent dice to replace any d20 roll with your predetermined numbers. Recover spell slots on Short Rests via Expert Divination.",
        features: [
          { level: 3, name: 'Divination Savant', description: "Gold and time to copy Divination spells into your spellbook is halved.", isChoice: false },
          { level: 3, name: 'Portent', description: "After a Long Rest, roll two d20s and record them. You can replace any attack roll, saving throw, or ability check (yours or a creature's you can see) with one of these rolls before the roll is made.", descriptionLong: "After each Long Rest, roll two d20s and record the numbers. Before any attack roll, saving throw, or ability check made by you or a creature you can see, you can replace that roll with one of your foretelling rolls \u2014 you must choose to do so before the original roll. Each foretelling roll can be used only once. A recorded 1 can doom an enemy's save; a recorded 20 can guarantee your own. At level 14 (Greater Portent) you roll three d20s instead.", isChoice: false },
          { level: 6, name: 'Expert Divination', description: "When you cast a Divination spell of level 2 or higher, recover one expended spell slot of a level lower than the spell (maximum level 5).", isChoice: false },
          { level: 10, name: 'The Third Eye', description: "Bonus Action: gain one of these until your next Short or Long Rest: Darkvision 60 ft, Ethereal Sight 60 ft, see through solid objects 1 ft thick out to 30 ft, or read any language.", isChoice: true, choiceType: 'other' },
          { level: 14, name: 'Greater Portent', description: "Roll three d20s for Portent instead of two.", isChoice: false },
        ],
      },
      {
        name: 'Evoker', unlock_level: 3,
        description: "Destructive magic perfected. Sculpt Spells protects allies in your own AoE blasts. Overchannel maximizes spell damage. Spell Bombardment adds extra damage dice.",
        features: [
          { level: 3, name: 'Evocation Savant', description: "Gold and time to copy Evocation spells into your spellbook is halved.", isChoice: false },
          { level: 3, name: 'Sculpt Spells', description: "When you cast an Evocation spell affecting others, protect 1 + the spell's level creatures: they automatically succeed on their save and take no damage from it.", descriptionLong: "When you cast an Evocation spell that affects other creatures you can see, you can choose a number of them equal to 1 + the spell's level. Those creatures automatically succeed on their saving throws against the spell, and they take no damage if they would normally take half damage on a success. This lets you drop a Fireball on a melee scrum without harming your allies \u2014 the defining Evoker safety net.", isChoice: false },
          { level: 6, name: 'Potent Cantrip', description: "When a creature succeeds on a saving throw against your cantrip, it still takes half the cantrip's damage.", isChoice: false },
          { level: 10, name: 'Empowered Evocation', description: (c) => { const intm = Math.max(1, Math.floor((c.intelligence - 10)/2)); return `Add your Intelligence modifier (+${intm}) to one damage roll of any Wizard Evocation spell you cast.`; }, descriptionLong: (c) => { const intm = Math.max(1, Math.floor((c.intelligence - 10)/2)); return `Whenever you cast a Wizard spell from the Evocation school, you can add your Intelligence modifier (currently +${intm}) to one damage roll of that spell. With multi-target evocations like Fireball this applies once (to the roll, affecting all targets), giving the Evoker a reliable bump to their signature damage.`; }, isChoice: false },
          { level: 14, name: 'Overchannel', description: "When you cast an Evocation spell of 1st-5th level that deals damage, you can deal maximum damage. First use is free; subsequent uses before a Long Rest deal 2d12 Necrotic damage per level above 1st.", isChoice: false },
        ],
      },
      {
        name: 'Illusionist', unlock_level: 3,
        description: "Make illusions physical. Improved Minor Illusion creates sound and image at once. Malleable Illusions lets you reshape active illusions. Eventually make them literally real.",
        features: [
          { level: 3, name: 'Illusion Savant', description: "Gold and time to copy Illusion spells into your spellbook is halved.", isChoice: false },
          { level: 3, name: 'Improved Minor Illusion', description: "When you cast Minor Illusion, create both a sound and an image with a single casting.", isChoice: false },
          { level: 6, name: 'Malleable Illusions', description: "When you cast an Illusion spell of level 1 or higher, use your action to change the nature of the illusion while maintaining concentration, effectively replacing its effect with new parameters.", isChoice: false },
          { level: 10, name: 'Illusory Self', description: "When a creature makes an attack roll against you, use your Reaction to impose Disadvantage on that roll (a phantasmal duplicate confuses the attacker). Recharge: Short or Long Rest.", isChoice: false },
          { level: 14, name: 'Illusory Reality', description: "When you cast an Illusion spell of level 1 or higher, choose one inanimate, non-magical object in the illusion. That object becomes real for 1 minute. It can't deal damage or harm creatures directly.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Artificer', hit_die: 8,
    primary_abilities: ['intelligence'],
    saving_throw_proficiencies: ['constitution', 'intelligence'],
    skill_choices: ['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Sleight of Hand'],
    skill_count: 2,
    armor_proficiencies: ['Light Armor', 'Medium Armor', 'Shields'],
    weapon_proficiencies: ['Simple Weapons'],
    tool_proficiencies: ["Thieves' Tools", "Tinker's Tools", "One type of Artisan's Tools of your choice"],
    is_spellcaster: true, spellcasting_ability: 'intelligence', spellcaster_type: 'half',
    subclasses: [
      {
        name: 'Alchemist', unlock_level: 3,
        description: "Brew magical elixirs with random beneficial effects. Heal allies, create experimental elixirs daily, and eventually unlock chemical immunity and free Greater Restoration.",
        features: [
          { level: 3, name: 'Alchemist Spells', description: "Always prepared: Healing Word, Ray of Sickness; Flaming Sphere, Melf's Acid Arrow; Gaseous Form, Mass Healing Word; Blight, Death Ward; Cloudkill, Raise Dead.", isChoice: false },
          { level: 3, name: 'Experimental Elixir', description: (c) => { const intm = Math.max(1, Math.floor((c.intelligence - 10)/2)); return `After a Long Rest, magically create ${intm} elixirs (Intelligence modifier, min 1), each with a random effect (Healing, Swiftness, Resilience, Boldness, Flight, or Transformation). Drinking is a Bonus Action.`; }, descriptionLong: (c) => { const intm = Math.max(1, Math.floor((c.intelligence - 10)/2)); return `Whenever you finish a Long Rest, you can magically produce experimental elixirs equal to your Intelligence modifier (currently ${intm}, minimum 1) in containers you touch \u2014 free of charge. Roll for or choose each elixir's effect (Healing, Swiftness, Resilience, Boldness, Flight, or Transformation). A creature can drink one as a Bonus Action. You can also make additional elixirs by expending a spell slot. Unused elixirs last until your next Long Rest.`; }, isChoice: false },
          { level: 5, name: 'Alchemical Savant', description: (c) => { const intm = Math.max(1, Math.floor((c.intelligence - 10)/2)); return `When you cast a spell using your Alchemist's Supplies, add your Intelligence modifier (+${intm}) to one roll of the spell that restores HP or deals Acid, Fire, Necrotic, or Poison damage.`; }, descriptionLong: (c) => { const intm = Math.max(1, Math.floor((c.intelligence - 10)/2)); return `When you cast a spell using your Alchemist's Supplies as the Spellcasting Focus, you add your Intelligence modifier (currently +${intm}) to one roll of that spell that restores Hit Points or deals Acid, Fire, Necrotic, or Poison damage. Turns even a humble cantrip or cure into a meaningfully stronger effect.`; }, isChoice: false },
          { level: 9, name: 'Restorative Reagents', description: "When a creature drinks your Experimental Elixir, they also gain Temp HP equal to 2d6 + INT mod. Also always have Lesser Restoration prepared, castable for free (Proficiency Bonus times per Long Rest).", isChoice: false },
          { level: 15, name: 'Chemical Mastery', description: "Resistance to Acid and Poison damage. Immunity to the Poisoned condition. Cast Greater Restoration and Heal once each per Long Rest without a spell slot.", isChoice: false },
        ],
      },
      {
        name: 'Armorer', unlock_level: 3,
        description: "Your armor IS your weapons. Choose Guardian (melee tank with Thunder Gauntlets) or Infiltrator (ranged stealth with Lightning Launcher). Both have unique capabilities.",
        features: [
          { level: 3, name: 'Armorer Spells', description: "Always prepared: Magic Missile, Thunderwave; Mirror Image, Shatter; Hypnotic Pattern, Lightning Bolt; Fire Shield, Greater Invisibility; Passwall, Wall of Force.", isChoice: false },
          { level: 3, name: 'Arcane Armor', description: "As an action, infuse a suit of armor as Arcane Armor. You can don and doff it as an action, it can't be removed against your will, and it provides special abilities based on your chosen model.", isChoice: false },
          { level: 3, name: 'Armor Model', description: "Choose Guardian (Thunder Gauntlets: 1d8 Thunder, target has Disadvantage attacking others; Defensive Field: Proficiency Bonus Temp HP as Bonus Action per Long Rest) or Infiltrator (Lightning Launcher: 1d6 Lightning, 90/300 range, 1d6 bonus once/turn; +5 Speed; Advantage on Stealth checks).", isChoice: true, choiceType: 'other' },
          { level: 9, name: 'Armor Modifications', description: "Your Arcane Armor has 4 infusion slots (don't count against your normal infusion limit). Each armor piece (boots, breastplate, helmet, gauntlets) counts separately for infusions.", isChoice: false },
          { level: 15, name: 'Perfected Armor', description: "Guardian: Reaction to pull a creature within 30 feet toward you (Str save), then deal 2d6 Lightning damage. Infiltrator: on Lightning Launcher hit, knock Prone (Str save); move up to half Speed without Opportunity Attacks.", isChoice: false },
        ],
      },
      {
        name: 'Artillerist', unlock_level: 3,
        description: "Construct magical cannons that blast fire, force, or provide protection. Your Eldritch Cannon fights independently and you can use your wand as an arcane focus.",
        features: [
          { level: 3, name: 'Artillerist Spells', description: "Always prepared: Shield, Thunderwave; Scorching Ray, Shatter; Fireball, Wind Wall; Ice Storm, Wall of Fire; Cone of Cold, Wall of Force.", isChoice: false },
          { level: 3, name: 'Eldritch Cannon', description: (c) => { const dmg = c.level >= 9 ? '3d8' : '2d8'; return `Magic action (1 hour to build, or a spell slot): create a Small/Tiny cannon. As a Bonus Action, activate it: Flamethrower (${dmg} Fire in a 15-ft cone, Dex save), Force Ballista (${dmg} Force ranged + push), or Protector (temp HP to allies).`; }, descriptionLong: (c) => { const dmg = c.level >= 9 ? '3d8' : '2d8'; return `Using your Artificer's Tools, you create a magical Eldritch Cannon (Small or Tiny) in an unoccupied space within 5 ft, taking 1 hour \u2014 or you can expend a spell slot to create it instantly. It has AC 18 and HP equal to five times your Artificer level. As a Bonus Action you can activate it (and move it up to 15 ft), choosing its type when created:\n\u2022 Flamethrower \u2014 15-ft cone, Dexterity save for ${dmg} Fire damage (half on success).\n\u2022 Force Ballista \u2014 ranged attack dealing ${dmg} Force damage and pushing the target 5 ft.\n\u2022 Protector \u2014 grants Temporary Hit Points to you and allies within 10 ft.\nDamage rises to 3d8 at level 9 (Explosive Cannon).`; }, save: { ability: 'DEX', dc: 'spell', targetMode: 'enemies' }, isChoice: false },
          { level: 5, name: 'Arcane Firearm', description: "Use your Artillerist's Tools as an arcane focus. When you cast a Artificer spell through these tools, add 1d8 to one damage roll.", isChoice: false },
          { level: 9, name: 'Explosive Cannon', description: "Eldritch Cannon damage dice increase to 3d8. Also, as an action, detonate it: 3d8 Force damage in 20-ft sphere (Dex save half, DC = spell save DC).", isChoice: false },
          { level: 15, name: 'Fortified Position', description: "Create two cannons at once instead of one. While within 10 feet of a cannon you created, you and allies have Half Cover.", isChoice: false },
        ],
      },
      {
        name: 'Battle Smith', unlock_level: 3,
        description: "A magical blacksmith who fights alongside a Steel Defender construct. Use Intelligence for weapon attacks and heal your defender to keep it fighting.",
        features: [
          { level: 3, name: 'Battle Smith Spells', description: "Always prepared: Heroism, Shield; Branding Smite, Warding Bond; Aura of Vitality, Conjure Barrage; Aura of Purity, Fire Shield; Banishing Smite, Mass Cure Wounds.", isChoice: false },
          { level: 3, name: 'Battle Ready', description: "Gain proficiency with Martial Weapons. When you attack with a magic weapon, use your Intelligence modifier for the attack and damage rolls instead of Strength or Dexterity.", isChoice: false },
          { level: 3, name: 'Steel Defender', description: (c) => { const pb = c.level >= 17 ? 6 : c.level >= 13 ? 5 : c.level >= 9 ? 4 : c.level >= 5 ? 3 : 2; return `Build a loyal mechanical Steel Defender. It acts on your Initiative, adds your proficiency bonus (+${pb}) to its rolls, and has HP = 2 \u00d7 Artificer level + your Intelligence modifier + 8.`; }, descriptionLong: (c) => { const pb = c.level >= 17 ? 6 : c.level >= 13 ? 5 : c.level >= 9 ? 4 : c.level >= 5 ? 3 : 2; const intm = Math.max(0, Math.floor((c.intelligence - 10)/2)); const hp = 2 * c.level + intm + 8; return `You build a Steel Defender construct that's friendly to you and your allies and obeys your commands. It shares your Initiative (acting right after you), adds your proficiency bonus (currently +${pb}) to its AC, attack rolls, damage, saving throws, and skills, and has Hit Points equal to 2 \u00d7 your Artificer level + your Intelligence modifier + 8 (currently ${hp}). Its Force-Empowered Rend attack and Deflect Attack Reaction make it both a damage dealer and a protector. You can repair it during a rest or with a spell slot.`; }, isChoice: false },
          { level: 9, name: 'Arcane Jolt', description: (c) => { const dice = c.level >= 15 ? '4d6' : '2d6'; return `When you or your Steel Defender hit with a magic weapon attack, choose: deal an extra ${dice} Force damage, or restore ${dice} HP to a creature within 30 ft. A few times per Long Rest (Intelligence modifier).`; }, descriptionLong: (c) => { const dice = c.level >= 15 ? '4d6' : '2d6'; const intm = Math.max(1, Math.floor((c.intelligence - 10)/2)); return `Once on each of your turns when you or your Steel Defender hits a target with a magic weapon attack, you can channel arcane energy into it. Choose one: the target takes an extra ${dice} Force damage, or one creature of your choice within 30 ft of the target regains Hit Points equal to ${dice}. You can use this a number of times equal to your Intelligence modifier (currently ${intm}, minimum 1) per Long Rest. The dice increase to 4d6 at level 15 (Improved Defender).`; }, isChoice: false },
          { level: 15, name: 'Improved Defender', description: "Arcane Jolt damage/healing increases to 4d6. Steel Defender gains +2 AC. When it uses Deflect Attack, the attacker takes 1d4 + INT mod Force damage.", isChoice: false },
        ],
      },
    ],
  },
  {
    name: 'Psion', hit_die: 6,
    source: 'ua',
    description: "INT-based spellcaster fueled by Psionic Energy Dice. Casts without Verbal or Material components. Uses Psionic Energy Dice to power telekinesis, telepathy, and psionic disciplines. (UA 2025)",
    primary_abilities: ['intelligence'],
    saving_throw_proficiencies: ['intelligence', 'wisdom'],
    skill_choices: ['Arcana', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Perception', 'Persuasion'],
    skill_count: 2,
    armor_proficiencies: [],
    weapon_proficiencies: ['Simple Weapons'],
    tool_proficiencies: [],
    is_spellcaster: true, spellcasting_ability: 'intelligence', spellcaster_type: 'full',
    subclasses: [
      {
        name: 'Metamorph',
        source: 'ua',
        description: "Your flesh becomes clay — reshape your body into weapons and armor. Organic Weapons let you sprout a Bone Blade (1d8), Flesh Maul (1d10), or Viscera Launcher (1d6 acid ranged). Mutable Form stretches your reach and speed. Extra Attack at level 6.",
        unlock_level: 3,
        spell_list: ['Alter Self', 'Cure Wounds', 'Inflict Wounds', 'Lesser Restoration', 'Aura of Vitality', 'Haste', 'Polymorph', 'Stoneskin', 'Contagion', 'Mass Cure Wounds'],
        features: [
          { level: 3, name: 'Metamorph Spells', description: "Always have Alter Self, Cure Wounds, Inflict Wounds, Lesser Restoration prepared. More spells unlock at 5, 7, 9.", isChoice: false },
          { level: 3, name: 'Mutable Form', description: "Bonus Action: expend 1 Psionic Energy Die — gain Temp HP equal to roll + INT mod, +5 ft reach, +5 ft speed, and Touch spells gain 10 ft range. Lasts 1 minute.", isChoice: false },
          { level: 3, name: 'Organic Weapons', description: "Magic action to form Bone Blade (1d8 piercing, finesse), Flesh Maul (1d10 bludgeoning, Disadvantage on target's next STR/CON save), or Viscera Launcher (1d6 acid, 30/90 ft, extra 1d6 on hit once/turn). Use INT for attacks.", isChoice: true, choiceType: 'other' },
          { level: 6, name: 'Extra Attack', description: "Attack twice when you take the Attack action. You can replace one attack with a Psion cantrip.", isChoice: false },
          { level: 6, name: 'Flesh Weaver', description: "When you use Mutable Form, spend an extra Psionic Energy Die to also gain +2 AC and boost spell healing by rolling a Psionic Energy Die.", isChoice: false },
          { level: 10, name: 'Improved Mutable Form', description: "Mutable Form extends to 10 minutes. Choose one bonus: Stony Epidermis (Advantage on Concentration saves + resistance), Superior Stride (Dash as BA + Climb/Swim Speed), or Unnatural Flexibility (+1 AC + squeeze through 1 inch gaps).", isChoice: true, choiceType: 'other' },
          { level: 14, name: 'Life-Bending Weapons', description: "Organic Weapon hits roll a free Psionic Energy Die for extra Necrotic damage (die not expended). OR expend a die to also heal nearby allies by that amount + INT mod.", isChoice: false },
        ],
      },
      {
        name: 'Psi Warper',
        source: 'ua',
        description: "Warp space with psionic force — teleport across the battlefield and fling enemies through space. Free Misty Step once per Long Rest. Warp Propel can teleport creatures instead of pushing them. Mass Teleportation at level 14. (Passed UA v1 playtest unchanged.)",
        unlock_level: 3,
        spell_list: ['Expeditious Retreat', 'Feather Fall', 'Misty Step', 'Shatter', 'Blink', 'Haste', 'Banishment', 'Dimension Door', 'Steel Wind Strike', 'Teleportation Circle'],
        features: [
          { level: 3, name: 'Psi Warper Spells', description: "Always have Expeditious Retreat, Feather Fall, Misty Step, Shatter prepared. More spells at 5, 7, 9.", isChoice: false },
          { level: 3, name: 'Teleportation', description: "Cast Misty Step without expending a spell slot once per Long Rest. Restore this use by expending 1 Psionic Energy Die (no action required).", isChoice: false },
          { level: 3, name: 'Warp Propel', description: "When a target fails the saving throw against Telekinetic Propel, you can teleport it to an unoccupied space within 30 ft instead of pushing it.", isChoice: false },
          { level: 6, name: 'Warp Space', description: "Cast Shatter and spend 1 Psionic Energy Die to expand radius to 20 ft — creatures that fail are pulled toward the center.", isChoice: false },
          { level: 6, name: 'Teleporter Combat', description: "After casting Misty Step, immediately cast a Psion cantrip (action casting time) as part of the same Bonus Action.", isChoice: false },
          { level: 10, name: 'Duplicitous Target', description: "Reaction: when a creature attacks you, spend 1 Psionic Energy Die to swap places with a willing ally within 30 ft — the attack hits them instead.", isChoice: false },
          { level: 14, name: 'Mass Teleportation', description: "Magic action: spend 4 Psionic Energy Dice. Teleport up to INT mod creatures (your choice) within 30 ft to unoccupied spaces within 150 ft. Unwilling targets may Wisdom save to resist.", isChoice: false },
        ],
      },
      {
        name: 'Psykinetic',
        source: 'ua',
        description: "Bend telekinetic force into barriers and battering rams. Enhanced Mage Hand, Telekinetic Techniques modify Propel, Destructive Trance grants flight and damage bonuses while active.",
        unlock_level: 3,
        spell_list: ['Cloud of Daggers', 'Levitate', 'Shield', 'Thunderwave', 'Slow', 'Telekinetic Crush', "Otiluke's Resilient Sphere", 'Stone Shape', 'Telekinesis', 'Wall of Force'],
        features: [
          { level: 3, name: 'Psykinetic Spells', description: "Always have Cloud of Daggers, Levitate, Shield, Thunderwave prepared. More spells at 5, 7, 9.", isChoice: false },
          { level: 3, name: 'Stronger Telekinesis', description: "Mage Hand range increases by 30 ft when you cast it, and it can carry up to 20 pounds.", isChoice: false },
          { level: 3, name: 'Telekinetic Techniques', description: "Telekinetic Propel: roll a free d4 instead of spending a Psionic Energy Die. On a failed save, also apply: Boost (+10 ft Speed), Disorient (no Opportunity Attacks), or Telekinetic Bolt (Force damage = die roll).", isChoice: true, choiceType: 'other' },
          { level: 6, name: 'Destructive Trance', description: "Start of turn: spend 1 Psionic Energy Die to gain Fly Speed 20 ft (hover) for 10 minutes. While active, when you cast a spell with a spell slot, roll a free Psionic Energy Die and add it to one damage roll.", isChoice: false },
          { level: 6, name: 'Rebounding Field', description: "Cast Shield to block an attack, then spend 1 Psionic Energy Die: attacker makes DEX save. Roll 1 die — on fail, attacker takes that Force damage + INT mod. You gain Temp HP equal to damage dealt (hit or miss).", isChoice: false },
          { level: 10, name: 'Enhanced Telekinetic Crush', description: "When casting Telekinetic Crush, spend 1 Psionic Energy Die to also halve all targets' Speed (hit or miss). Add the die roll to spell damage.", isChoice: false },
          { level: 14, name: 'Heightened Telekinesis', description: "Cast Telekinesis without a spell slot by spending 4 Psionic Energy Dice. Optionally remove Concentration — it lasts 1 minute and can target Gargantuan creatures.", isChoice: false },
        ],
      },
      {
        name: 'Telepath',
        source: 'ua',
        description: "Master the landscape of the mind — read thoughts undetected, distract attackers, and eventually scramble the minds of many at once. Bulwark Mind grants psychic resistance and saving throw bonuses.",
        unlock_level: 3,
        spell_list: ['Bane', 'Command', 'Detect Thoughts', 'Mind Spike', 'Counterspell', 'Speak with Plants', 'Compulsion', 'Confusion', 'Awaken', 'Modify Memory'],
        features: [
          { level: 3, name: 'Telepath Spells', description: "Always have Bane, Command, Detect Thoughts, Mind Spike prepared. More spells at 5, 7, 9.", isChoice: false },
          { level: 3, name: 'Mind Infiltrator', description: "Cast Detect Thoughts spending only 1 Psionic Energy Die: no components, no Concentration. Target doesn't know you're probing if it fails its Wisdom save.", isChoice: false },
          { level: 3, name: 'Telepathic Distraction', description: "Reaction: when a creature within your telepathy range hits with an attack, roll 1 Psionic Energy Die and subtract it from the attack roll (possibly turning it into a miss). Die only expended if the attack misses.", isChoice: false },
          { level: 6, name: 'Bulwark Mind', description: "Start of turn: spend 1 Psionic Energy Die to enter a fortified state for 10 minutes. Gain Resistance to Psychic damage; add a free Psionic Energy Die roll to INT/WIS/CHA saves (die not expended).", isChoice: false },
          { level: 6, name: 'Potent Thoughts', description: "Telepathy range increases to 60 ft. Add your Intelligence modifier to damage dealt by any Psion cantrip.", isChoice: false },
          { level: 10, name: 'Telepathic Bolstering', description: "Reaction: when you or a creature within your telepathy range fails a check or misses an attack, spend 1 Psionic Energy Die — add the roll to the d20, potentially turning failure into success (die only expended on success).", isChoice: false },
          { level: 14, name: 'Scramble Minds', description: "Cast Confusion without a spell slot by spending 4 Psionic Energy Dice. Expanded radius to 30 ft, exempt one creature you choose, and you choose each affected target's behavior from the table instead of rolling.", isChoice: false },
        ],
      },
    ],
  },
];

export const CLASS_MAP: Record<string, ClassData> = Object.fromEntries(CLASSES.map(c => [c.name, c]));

export function buildClassMap(classList: typeof CLASSES): Record<string, typeof CLASSES[0]> {
  return Object.fromEntries(classList.map(c => [c.name, c]));
}

// ─── Subclass always-prepared spell name → ID lookup ─────────────────────────
// All spells referenced in any subclass `spell_list` must be mapped here, and
// their ID must exist in SPELL_MAP (data/spells.ts). Missing mappings cause
// the spell to be silently dropped from auto-grants — hard to debug, so keep
// this in sync when adding new subclasses.
const SPELL_NAME_TO_ID: Record<string, string> = {
  'Expeditious Retreat': 'expeditious-retreat',
  'Feather Fall': 'feather-fall',
  'Misty Step': 'misty-step',
  'Shatter': 'shatter',
  'Blink': 'blink',
  'Haste': 'haste',
  'Banishment': 'banishment',
  'Dimension Door': 'dimension-door',
  'Steel Wind Strike': 'steel-wind-strike',
  'Teleportation Circle': 'teleportation-circle',
  'Cloud of Daggers': 'cloud-of-daggers',
  'Levitate': 'levitate',
  'Shield': 'shield',
  'Thunderwave': 'thunderwave',
  'Slow': 'slow',
  'Telekinetic Crush': 'telekinetic-crush',
  // Stored in data as "Resilient Sphere" per 2024 PHB naming; UA Psion lists
  // it with the classic "Otiluke's" prefix, so accept both.
  "Otiluke's Resilient Sphere": 'resilient-sphere',
  'Resilient Sphere': 'resilient-sphere',
  'Stone Shape': 'stone-shape',
  'Stoneskin': 'stoneskin',
  'Telekinesis': 'telekinesis',
  'Wall of Force': 'wall-of-force',
  'Bane': 'bane',
  'Command': 'command',
  'Detect Thoughts': 'detect-thoughts',
  'Mind Spike': 'mind-spike',
  'Counterspell': 'counterspell',
  'Speak with Plants': 'speak-with-plants',
  'Compulsion': 'compulsion',
  'Confusion': 'confusion',
  'Awaken': 'awaken',
  'Modify Memory': 'modify-memory',
  'Alter Self': 'alter-self',
  'Cure Wounds': 'cure-wounds',
  'Inflict Wounds': 'inflict-wounds',
  'Lesser Restoration': 'lesser-restoration',
  'Aura of Vitality': 'aura-of-vitality',
  'Polymorph': 'polymorph',
  'Contagion': 'contagion',
  'Mass Healing Word': 'mass-healing-word',
  'Greater Restoration': 'greater-restoration',
  'Mass Cure Wounds': 'mass-cure-wounds',
  // v2.28: Cleric domain + Paladin oath spell mappings
  'Bless': 'bless',
  'Aid': 'aid',
  'Revivify': 'revivify',
  'Death Ward': 'death-ward',
  'Guardian of Faith': 'guardian-of-faith',
  'Raise Dead': 'raise-dead',
  'Burning Hands': 'burning-hands',
  'Faerie Fire': 'faerie-fire',
  'Flaming Sphere': 'flaming-sphere',
  'Scorching Ray': 'scorching-ray',
  'Daylight': 'daylight',
  'Fireball': 'fireball',
  'Wall of Fire': 'wall-of-fire',
  'Flame Strike': 'flame-strike',
  'Scrying': 'scrying',
  'Charm Person': 'charm-person',
  'Disguise Self': 'disguise-self',
  'Invisibility': 'invisibility',
  'Pass Without Trace': 'pass-without-trace',
  'Hypnotic Pattern': 'hypnotic-pattern',
  'Nondetection': 'nondetection',
  'Dominate Person': 'dominate-person',
  'Divine Favor': 'divine-favor',
  'Shield of Faith': 'shield-of-faith',
  'Magic Weapon': 'magic-weapon',
  'Spiritual Weapon': 'spiritual-weapon',
  "Crusader's Mantle": 'crusaders-mantle',
  'Spirit Guardians': 'spirit-guardians',
  'Fire Shield': 'fire-shield',
  'Freedom of Movement': 'freedom-of-movement',
  'Destructive Wave': 'destructive-wave',
  'Hold Monster': 'hold-monster',
  'Protection from Evil and Good': 'protection-from-evil-and-good',
  'Zone of Truth': 'zone-of-truth',
  'Beacon of Hope': 'beacon-of-hope',
  'Dispel Magic': 'dispel-magic',
  'Commune': 'commune',
  'Guiding Bolt': 'guiding-bolt',
  'Heroism': 'heroism',
  'Enhance Ability': 'enhance-ability',
  'Protection from Energy': 'protection-from-energy',
  'Legend Lore': 'legend-lore',
  'Ensnaring Strike': 'ensnaring-strike',
  'Speak with Animals': 'speak-with-animals',
  'Moonbeam': 'moonbeam',
  'Plant Growth': 'plant-growth',
  'Ice Storm': 'ice-storm',
  'Commune with Nature': 'commune-with-nature',
  'Tree Stride': 'tree-stride',
  "Hunter's Mark": 'hunters-mark',
  'Hold Person': 'hold-person',
};

/**
 * Get spell IDs for a subclass's always-prepared spell list, filtered by
 * character level using the 2024 PHB standard full-caster progression:
 *
 *   spell level 1-2 ....... accessible at subclass unlock_level (usually 3)
 *   spell level 3 ......... at unlock_level + 2 (usually 5)
 *   spell level 4 ......... at unlock_level + 4 (usually 7)
 *   spell level 5 ......... at unlock_level + 6 (usually 9)
 *
 * Pass `characterLevel = undefined` to get the full list regardless of level
 * (used for UI that needs to show what a subclass will eventually grant).
 */
export function getSubclassSpellIds(
  subclassName: string,
  className: string,
  characterLevel?: number,
): string[] {
  const cls = CLASS_MAP[className];
  if (!cls) return [];
  const sub = cls.subclasses?.find(s => s.name === subclassName);
  if (!sub?.spell_list) return [];

  const allIds = sub.spell_list
    .map((name: string) => SPELL_NAME_TO_ID[name])
    .filter(Boolean) as string[];

  if (characterLevel === undefined) return allIds;

  const unlockLevel = sub.unlock_level ?? 3;

  return allIds.filter(id => {
    const spell = SPELL_MAP[id];
    if (!spell) return false; // unknown spell — safer to drop than silently include
    // Levels 0, 1, 2 all gated only by the subclass unlock level itself.
    // Levels 3+ gated by +2 character levels per spell-level tier above 2.
    const extraLevelsNeeded = Math.max(0, spell.level - 2) * 2;
    return characterLevel >= unlockLevel + extraLevelsNeeded;
  });
}
