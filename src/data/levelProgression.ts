/**
 * Level progression milestones for all 12 classes — 2024 PHB.
 * Used by the character creator to show what a character gains at each level.
 */

export type ChoiceType =
  | 'asi'           // Ability Score Improvement or Feat
  | 'subclass'      // Choose your subclass (level 3 for all classes, 2024 PHB)
  | 'fighting_style'
  | 'expertise'
  | 'spells'        // Learn/prepare spells
  | 'cantrips'
  | 'invocations'   // Warlock Eldritch Invocations
  | 'metamagic'     // Sorcerer Metamagic
  | 'mystic_arcanum'// Warlock
  | 'magical_secrets'// Bard
  | 'pact_boon'     // Warlock Pact Boon
  | 'divine_order'  // Cleric
  | 'primal_order'  // Druid
  | 'epic_boon'     // Level 19+
  | 'other';

export interface ChoiceItem {
  type: ChoiceType;
  label: string;
}

export interface LevelMilestone {
  level: number;
  features: string[];
  choices?: ChoiceItem[];
  subclassFeature?: boolean;  // Subclass grants a feature this level
  newSpellLevel?: number;     // First access to this spell slot level
}

const ASI: ChoiceItem = { type: 'asi', label: 'Ability Score Improvement or Feat' };
const EPIC: ChoiceItem = { type: 'epic_boon', label: 'Epic Boon feat' };

export const CLASS_LEVEL_PROGRESSION: Record<string, LevelMilestone[]> = {

  // ── BARBARIAN ───────────────────────────────────────────────────────────────
  Barbarian: [
    { level: 1,  features: ['Rage (2/Long Rest)', 'Unarmored Defense', 'Weapon Mastery'] },
    { level: 2,  features: ['Danger Sense', 'Reckless Attack'] },
    { level: 3,  features: ['Primal Knowledge (1 skill)'],
                 choices: [{ type: 'subclass', label: 'Choose Primal Path' }] },
    { level: 4,  features: [], choices: [ASI] },
    { level: 5,  features: ['Extra Attack', 'Fast Movement (+10 ft)'] },
    { level: 6,  features: ['Feral Instinct'], subclassFeature: true },
    { level: 7,  features: ['Instinctive Pounce'] },
    { level: 8,  features: [], choices: [ASI] },
    { level: 9,  features: ['Brutal Strike'] },
    { level: 10, features: [], subclassFeature: true },
    { level: 11, features: ['Relentless Rage', 'Rage → 4 uses'] },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: ['Improved Brutal Strike', 'Rage → 5 uses'] },
    { level: 14, features: [], subclassFeature: true },
    { level: 15, features: ['Persistent Rage', 'Rage → 6 uses'] },
    { level: 16, features: [], choices: [ASI] },
    { level: 17, features: ['Improved Brutal Strike II'] },
    { level: 18, features: ['Indomitable Might'] },
    { level: 19, features: ['Rage → unlimited'], choices: [ASI, EPIC] },
    { level: 20, features: ['Primal Champion (+4 STR, +4 CON)'] } ],

  // ── BARD ────────────────────────────────────────────────────────────────────
  Bard: [
    { level: 1,  features: ['Bardic Inspiration (CHA mod/Long Rest)', 'Spellcasting (2 cantrips, 4 spells)'] },
    { level: 2,  features: ['Jack of All Trades', 'Song of Rest'] },
    { level: 3,  features: ['Font of Inspiration'],
                 choices: [
                   { type: 'subclass', label: 'Choose Bard College' },
                   { type: 'expertise', label: 'Expertise: double proficiency for 2 skills' } ], newSpellLevel: 2 },
    { level: 4,  features: [], choices: [ASI] },
    { level: 5,  features: ['Bardic Inspiration → d8', 'Font of Inspiration: recover on Short Rest'] },
    { level: 6,  features: ['Countercharm'], subclassFeature: true, newSpellLevel: 3 },
    { level: 7,  features: [], newSpellLevel: 4 },
    { level: 8,  features: [], choices: [ASI] },
    { level: 9,  features: [],
                 choices: [
                   { type: 'expertise', label: 'Expertise: 2 more skills' } ], newSpellLevel: 5 },
    { level: 10, features: ['Bardic Inspiration → d10'] },
    { level: 11, features: [], newSpellLevel: 6 },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: [], newSpellLevel: 7 },
    { level: 14, features: [], subclassFeature: true },
    { level: 15, features: ['Bardic Inspiration → d12'], newSpellLevel: 8 },
    { level: 16, features: [], choices: [ASI] },
    { level: 17, features: [], newSpellLevel: 9 },
    { level: 18, features: [], subclassFeature: true },
    { level: 19, features: [], choices: [ASI, EPIC] },
    { level: 20, features: ['Words of Creation'] } ],

  // ── CLERIC ──────────────────────────────────────────────────────────────────
  Cleric: [
    { level: 1,  features: ['Spellcasting (Prepared: WIS + level)', 'Divine Order'],
                 choices: [
                   { type: 'divine_order', label: 'Divine Order: choose Protective or Thaumaturge' } ] },
    { level: 2,  features: ['Channel Divinity (1/Short Rest)', 'Turn Undead'] },
    { level: 3,  features: [],
                 choices: [
                   { type: 'subclass', label: 'Choose Divine Domain (gains domain spells + features)' } ], newSpellLevel: 2 },
    { level: 4,  features: [], choices: [ASI] },
    { level: 5,  features: ['Smite Undead'], newSpellLevel: 3 },
    { level: 6,  features: ['Channel Divinity (2/Short Rest)'], subclassFeature: true, newSpellLevel: 4 },
    { level: 7,  features: [],
                 choices: [{ type: 'other', label: 'Blessed Strikes: choose Divine Strike or Potent Spellcasting' }] },
    { level: 8,  features: [], choices: [ASI] },
    { level: 9,  features: [], newSpellLevel: 5 },
    { level: 10, features: ['Divine Intervention (once/day)'] },
    { level: 11, features: [], subclassFeature: true, newSpellLevel: 6 },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: [], newSpellLevel: 7 },
    { level: 14, features: ['Improved Blessed Strikes'], subclassFeature: true },
    { level: 15, features: [], newSpellLevel: 8 },
    { level: 16, features: [], choices: [ASI] },
    { level: 17, features: [], subclassFeature: true, newSpellLevel: 9 },
    { level: 18, features: ['Channel Divinity (3/Short Rest)'] },
    { level: 19, features: [], choices: [ASI, EPIC] },
    { level: 20, features: ['Greater Divine Intervention (once/day, no charges)'] } ],

  // ── DRUID ───────────────────────────────────────────────────────────────────
  Druid: [
    { level: 1,  features: ['Druidic (secret language)', 'Spellcasting', 'Wild Shape (CR 1/4, no fly/swim)'],
                 choices: [
                   { type: 'primal_order', label: 'Primal Order: choose Magician or Warden' } ] },
    { level: 2,  features: ['Wild Shape improved (CR 1/4 swim)', 'Wild Companion (optional)'] },
    { level: 3,  features: [],
                 choices: [{ type: 'subclass', label: 'Choose Druid Circle' }], newSpellLevel: 2 },
    { level: 4,  features: ['Wild Shape → CR 1/2 (no fly)'], choices: [ASI] },
    { level: 5,  features: [], newSpellLevel: 3 },
    { level: 6,  features: [], subclassFeature: true, newSpellLevel: 4 },
    { level: 7,  features: [] },
    { level: 8,  features: ['Wild Shape → CR 1'], choices: [ASI] },
    { level: 9,  features: [], newSpellLevel: 5 },
    { level: 10, features: ['Wild Shape → CR 2'], subclassFeature: true, newSpellLevel: 6 },
    { level: 11, features: [] },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: [], newSpellLevel: 7 },
    { level: 14, features: [], subclassFeature: true },
    { level: 15, features: [], newSpellLevel: 8 },
    { level: 16, features: ['Wild Shape → CR 3'], choices: [ASI] },
    { level: 17, features: [], newSpellLevel: 9 },
    { level: 18, features: ['Beast Spells (cast while Wild Shape)', 'Wild Shape → CR 4'], subclassFeature: true },
    { level: 19, features: [], choices: [ASI, EPIC] },
    { level: 20, features: ['Archdruid (unlimited Wild Shape uses, +20 max HP)'] } ],

  // ── FIGHTER ─────────────────────────────────────────────────────────────────
  Fighter: [
    { level: 1,  features: ['Second Wind (1d10+level/Short Rest)', 'Weapon Mastery'],
                 choices: [{ type: 'fighting_style', label: 'Choose Fighting Style' }] },
    { level: 2,  features: ['Action Surge (1/Short Rest)', 'Tactical Mind'] },
    { level: 3,  features: [],
                 choices: [{ type: 'subclass', label: 'Choose Martial Archetype' }] },
    { level: 4,  features: [], choices: [ASI] },
    { level: 5,  features: ['Extra Attack (2 attacks)'] },
    { level: 6,  features: [], choices: [ASI] },
    { level: 7,  features: [], subclassFeature: true },
    { level: 8,  features: [], choices: [ASI] },
    { level: 9,  features: ['Tactical Shift', 'Indomitable (1/Long Rest)'] },
    { level: 10, features: [], subclassFeature: true },
    { level: 11, features: ['Extra Attack (3 attacks total)'] },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: ['Indomitable (2/Long Rest)'], subclassFeature: true },
    { level: 14, features: [], choices: [ASI] },
    { level: 15, features: [], subclassFeature: true },
    { level: 16, features: [], choices: [ASI] },
    { level: 17, features: ['Action Surge (2/Short Rest)', 'Indomitable (3/Long Rest)'] },
    { level: 18, features: [], subclassFeature: true },
    { level: 19, features: [], choices: [ASI, EPIC] },
    { level: 20, features: ['Extra Attack (4 attacks total)'] } ],

  // ── MONK ────────────────────────────────────────────────────────────────────
  Monk: [
    { level: 1,  features: ['Martial Arts (unarmed d4)', 'Unarmored Defense (DEX+WIS)', 'Weapon Mastery'] },
    { level: 2,  features: ['Monk\'s Focus (Ki: 2 pts/Short Rest)', 'Patient Defense', 'Step of the Wind', 'Stunning Strike', 'Unarmored Movement (+10 ft)'] },
    { level: 3,  features: ['Deflect Attacks'],
                 choices: [{ type: 'subclass', label: 'Choose Monastic Tradition' }] },
    { level: 4,  features: ['Slow Fall'], choices: [ASI] },
    { level: 5,  features: ['Extra Attack', 'Ki-Empowered Strikes', 'Stunning Strike improved'] },
    { level: 6,  features: ['Evasion', 'Unarmored Movement (+15 ft)'], subclassFeature: true },
    { level: 7,  features: ['Stillness of Mind'] },
    { level: 8,  features: [], choices: [ASI] },
    { level: 9,  features: ['Acrobatic Movement (run on vertical surfaces/water)'] },
    { level: 10, features: ['Heightened Focus', 'Unarmored Movement (+20 ft)'], subclassFeature: true },
    { level: 11, features: ['Unarmed d8'], subclassFeature: true },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: ['Deflect Energy'] },
    { level: 14, features: ['Disciplined Survivor', 'Unarmored Movement (+25 ft)'], subclassFeature: true },
    { level: 15, features: ['Perfect Focus (regain 4 Focus pts on initiative if 0)'] },
    { level: 16, features: [], choices: [ASI] },
    { level: 17, features: ['Unarmed d10', 'Superior Defense'], subclassFeature: true },
    { level: 18, features: ['Body and Mind (+4 DEX, +4 WIS)', 'Unarmored Movement (+30 ft)'] },
    { level: 19, features: [], choices: [ASI, EPIC] },
    { level: 20, features: ['Perfect Self (restore 4 Focus on initiative roll)'] } ],

  // ── PALADIN ─────────────────────────────────────────────────────────────────
  Paladin: [
    { level: 1,  features: ['Lay on Hands (5 HP pool/Long Rest)', 'Divine Sense', 'Spellcasting', 'Weapon Mastery'] },
    { level: 2,  features: ['Divine Smite (on hit: spend slot for radiant)', 'Paladin\'s Smite'],
                 choices: [{ type: 'fighting_style', label: 'Choose Fighting Style' }] },
    { level: 3,  features: [],
                 choices: [{ type: 'subclass', label: 'Choose Sacred Oath (gains oath spells + Channel Divinity)' }], newSpellLevel: 2 },
    { level: 4,  features: [], choices: [ASI] },
    { level: 5,  features: ['Extra Attack', 'Faithful Steed (find steed)'], newSpellLevel: 3 },
    { level: 6,  features: ['Aura of Protection (add CHA to all saves within 10 ft)'], subclassFeature: true },
    { level: 7,  features: [], newSpellLevel: 4 },
    { level: 8,  features: [], choices: [ASI] },
    { level: 9,  features: [], newSpellLevel: 5 },
    { level: 10, features: ['Aura of Courage (immune to frightened within 10 ft)'], subclassFeature: true },
    { level: 11, features: ['Radiant Strikes (+1d8 radiant on weapon attacks)'] },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: [] },
    { level: 14, features: ['Restoring Touch', 'Lay on Hands: remove conditions'], subclassFeature: true },
    { level: 15, features: [] },
    { level: 16, features: [], choices: [ASI] },
    { level: 17, features: ['Aura of Protection/Courage expand to 30 ft'] },
    { level: 18, features: [], subclassFeature: true },
    { level: 19, features: [], choices: [ASI, EPIC] },
    { level: 20, features: ['Holy Nimbus (aura of daylight, undead/fiend disadvantage)'], subclassFeature: true } ],

  // ── RANGER ──────────────────────────────────────────────────────────────────
  Ranger: [
    { level: 1,  features: ['Favored Enemy', 'Weapon Mastery', 'Spellcasting'],
                 choices: [
                   { type: 'expertise', label: 'Expertise: double proficiency for 1 skill' } ] },
    { level: 2,  features: ['Deft Explorer (1 extra language/terrain)'],
                 choices: [
                   { type: 'fighting_style', label: 'Choose Fighting Style' } ] },
    { level: 3,  features: ['Roving (+5 ft movement, climb/swim speed)'],
                 choices: [
                   { type: 'subclass', label: 'Choose Ranger Conclave' } ], newSpellLevel: 2 },
    { level: 4,  features: [], choices: [ASI] },
    { level: 5,  features: ['Extra Attack', 'Tireless (Exhaustion on rest)'] },
    { level: 6,  features: [], 
                 choices: [
                   { type: 'expertise', label: 'Expertise: 1 more skill' } ], subclassFeature: true, newSpellLevel: 3 },
    { level: 7,  features: ['Feral Senses (no disadvantage attacking invisible creatures)'] },
    { level: 8,  features: [], choices: [ASI] },
    { level: 9,  features: [], newSpellLevel: 4 },
    { level: 10, features: [], subclassFeature: true },
    { level: 11, features: ['Foe Slayer (add WIS to damage vs Favored Enemy)'], newSpellLevel: 5 },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: [] },
    { level: 14, features: [], subclassFeature: true },
    { level: 15, features: [] },
    { level: 16, features: [], choices: [ASI] },
    { level: 17, features: [] },
    { level: 18, features: ['Feral Senses enhanced'], subclassFeature: true },
    { level: 19, features: [], choices: [ASI, EPIC] },
    { level: 20, features: ['Foe Slayer improved'] } ],

  // ── ROGUE ───────────────────────────────────────────────────────────────────
  Rogue: [
    { level: 1,  features: ['Sneak Attack (1d6)', 'Thieves\' Cant', 'Weapon Mastery'],
                 choices: [{ type: 'expertise', label: 'Expertise: double proficiency for 2 skills' }] },
    { level: 2,  features: ['Cunning Action (Dash/Disengage/Hide as Bonus Action)'] },
    { level: 3,  features: ['Sneak Attack (2d6)', 'Steady Aim (Bonus Action for advantage, no movement)'],
                 choices: [{ type: 'subclass', label: 'Choose Roguish Archetype' }] },
    { level: 4,  features: ['Sneak Attack (2d6)'], choices: [ASI] },
    { level: 5,  features: ['Cunning Strike', 'Sneak Attack (3d6)', 'Uncanny Dodge'] },
    { level: 6,  features: ['Sneak Attack (3d6)'],
                 choices: [{ type: 'expertise', label: 'Expertise: 2 more skills' }], subclassFeature: true },
    { level: 7,  features: ['Evasion', 'Sneak Attack (4d6)'] },
    { level: 8,  features: ['Sneak Attack (4d6)'], choices: [ASI] },
    { level: 9,  features: ['Sneak Attack (5d6)'], subclassFeature: true,
                 choices: [{ type: 'other', label: 'Subtle Strikes: choose Devious feature' }] },
    { level: 10, features: ['Sneak Attack (5d6)'], choices: [ASI] },
    { level: 11, features: ['Reliable Talent (min 10 on proficient checks)', 'Sneak Attack (6d6)'], subclassFeature: true },
    { level: 12, features: ['Sneak Attack (6d6)'], choices: [ASI] },
    { level: 13, features: ['Sneak Attack (7d6)'], subclassFeature: true },
    { level: 14, features: ['Devious Strikes', 'Sneak Attack (7d6)'] },
    { level: 15, features: ['Slippery Mind (proficiency in WIS + CHA saves)', 'Sneak Attack (8d6)'], subclassFeature: true },
    { level: 16, features: ['Sneak Attack (8d6)'], choices: [ASI] },
    { level: 17, features: ['Sneak Attack (9d6)'], subclassFeature: true },
    { level: 18, features: ['Elusive (attacks never have advantage vs you)', 'Sneak Attack (9d6)'] },
    { level: 19, features: ['Sneak Attack (10d6)'], choices: [ASI, EPIC] },
    { level: 20, features: ['Stroke of Luck (turn miss to hit / failed check to 20, 1/Short Rest)'] } ],

  // ── SORCERER ────────────────────────────────────────────────────────────────
  Sorcerer: [
    { level: 1,  features: ['Innate Sorcery (1 min of advantage, 2/Long Rest)', 'Font of Magic', 'Spellcasting (4 cantrips, 2 spells)'] },
    { level: 2,  features: ['Sorcery Points (2/Long Rest)'],
                 choices: [
                   { type: 'metamagic', label: 'Choose 2 Metamagic options' } ] },
    { level: 3,  features: ['Sorcery Points (3)'],
                 choices: [
                   { type: 'subclass', label: 'Choose Sorcerous Origin (grants spells + features)' } ], newSpellLevel: 2 },
    { level: 4,  features: ['Sorcery Points (4)'],
                 choices: [ASI, { type: 'metamagic', label: 'Learn 1 new Metamagic option' }] },
    { level: 5,  features: ['Sorcery Points (5)'], newSpellLevel: 3 },
    { level: 6,  features: ['Sorcery Points (6)'], subclassFeature: true },
    { level: 7,  features: ['Sorcery Points (7)'], newSpellLevel: 4 },
    { level: 8,  features: ['Sorcery Points (8)'], choices: [ASI] },
    { level: 9,  features: ['Sorcery Points (9)'], newSpellLevel: 5 },
    { level: 10, features: ['Sorcery Points (10)'],
                 choices: [
                   { type: 'metamagic', label: 'Learn 1 new Metamagic option' } ], subclassFeature: true },
    { level: 11, features: ['Sorcery Points (11)'], newSpellLevel: 6 },
    { level: 12, features: ['Sorcery Points (12)'], choices: [ASI] },
    { level: 13, features: ['Sorcery Points (13)'], newSpellLevel: 7 },
    { level: 14, features: ['Sorcery Points (14)'], subclassFeature: true },
    { level: 15, features: ['Sorcery Points (15)'], newSpellLevel: 8 },
    { level: 16, features: ['Sorcery Points (16)'], choices: [ASI] },
    { level: 17, features: ['Sorcery Points (17)'],
                 choices: [
                   { type: 'metamagic', label: 'Learn 1 new Metamagic option' } ], newSpellLevel: 9 },
    { level: 18, features: ['Sorcery Points (18)'], subclassFeature: true },
    { level: 19, features: ['Sorcery Points (19)'], choices: [ASI, EPIC] },
    { level: 20, features: ['Arcane Apotheosis: 1 free Metamagic per turn'] } ],

  // ── WARLOCK ─────────────────────────────────────────────────────────────────
  Warlock: [
    { level: 1,  features: ['Pact Magic (1 slot, Short Rest recovery)', 'Eldritch Invocations (1)'],
                 choices: [
                   { type: 'invocations', label: 'Choose 1 Eldritch Invocation' } ] },
    { level: 2,  features: ['Pact Magic (2 slots)', 'Magical Cunning (recover half slots, 1/Long Rest)'],
                 choices: [
                   { type: 'invocations', label: 'Learn 1 more Eldritch Invocation (2 total)' } ] },
    { level: 3,  features: ['Pact Magic → 2nd level slots'],
                 choices: [
                   { type: 'subclass', label: 'Choose Otherworldly Patron (unlocks patron spells + features)' },
                   { type: 'pact_boon', label: 'Pact Boon: choose Pact of the Blade, Chain, or Talisman' },
                   { type: 'invocations', label: 'Learn 1 more Invocation (3 total)' } ] },
    { level: 4,  features: [],
                 choices: [ASI, { type: 'invocations', label: 'Learn 1 more Invocation (4 total)' }] },
    { level: 5,  features: ['Pact Magic → 3rd level slots'],
                 choices: [
                   { type: 'invocations', label: 'Learn 1 more Invocation (5 total)' } ] },
    { level: 6,  features: [],
                 choices: [
                   { type: 'invocations', label: 'Learn 1 more Invocation (6 total)' } ], subclassFeature: true },
    { level: 7,  features: ['Pact Magic → 4th level slots'],
                 choices: [
                   { type: 'invocations', label: 'Learn 1 more Invocation' } ] },
    { level: 8,  features: [],
                 choices: [ASI, { type: 'invocations', label: 'Learn 1 more Invocation (7 total)' }] },
    { level: 9,  features: ['Pact Magic → 5th level slots'],
                 choices: [
                   { type: 'invocations', label: 'Learn 1 more Invocation (8 total)' } ] },
    { level: 10, features: [],
                 choices: [
                   { type: 'invocations', label: 'Learn 1 more Invocation' } ], subclassFeature: true },
    { level: 11, features: [] },
    { level: 12, features: [],
                 choices: [ASI, { type: 'invocations', label: 'Learn 1 more Invocation (9 total)' }] },
    { level: 13, features: [] },
    { level: 14, features: [],
                 choices: [
                   { type: 'invocations', label: 'Learn 1 more Invocation (10 total)' } ], subclassFeature: true },
    { level: 15, features: [] },
    { level: 16, features: [],
                 choices: [ASI] },
    { level: 17, features: [],
                 choices: [{ type: 'invocations', label: 'Learn 1 more Invocation (11 total)' } ] },
    { level: 18, features: [],
                 choices: [
                   { type: 'invocations', label: 'Learn 1 more Invocation (12 total)' } ], subclassFeature: true },
    { level: 19, features: [], choices: [ASI, EPIC] },
    { level: 20, features: ['Eldritch Master (recover all Pact slots, 1/Long Rest)'] } ],

  // ── WIZARD ──────────────────────────────────────────────────────────────────
  Psion: [
    { level: 1,  features: ['Psionic Talent (INT-based spellcasting, 4 prepared spells)', 'Telepathic Sense (detect surface thoughts 30 ft, 1 min, INT mod uses/LR)'] },
    { level: 2,  features: ['Psionic Focus: concentration spells cost no material components', 'Psychic Defense: add INT mod to Wisdom saves'] },
    { level: 3,  features: ['Mind Link: telepathic communication 120 ft (always active)'],
                 choices: [
                   { type: 'subclass', label: 'Choose Psionic Discipline (Metamorph / Psi Warper / Psykinetic / Telepath)' } ], newSpellLevel: 2 },
    { level: 4,  features: ['Psionic Augmentation: add INT mod to one concentration spell\'s save DC'],
                 choices: [ASI] },
    { level: 5,  features: ['Psionic Blast: when you cast a spell, one creature must make a WIS save or be frightened until end of next turn (INT mod uses/LR)'], newSpellLevel: 3 },
    { level: 6,  features: ['Mental Fortitude: resistance to Psychic damage', 'Subclass feature'], subclassFeature: true },
    { level: 7,  features: ['Psionic Ward: use Reaction to impose Disadvantage on one attack roll against you (INT mod uses/LR)'], newSpellLevel: 4 },
    { level: 8,  features: [],
                 choices: [ASI] },
    { level: 9,  features: ['Psionic Resilience: advantage on Concentration saves'], newSpellLevel: 5 },
    { level: 10, features: ['Subclass feature', 'Astral Sight: cast Detect Thoughts without spell slot once per Long Rest'], subclassFeature: true },
    { level: 11, features: ['Psionic Surge: once per turn when you deal Psychic damage, add your INT modifier to the damage'], newSpellLevel: 6 },
    { level: 12, features: [],
                 choices: [ASI] },
    { level: 13, features: ['Mind Vault: store one prepared spell in your mind. It is always prepared and doesn\'t count against your limit'], newSpellLevel: 7 },
    { level: 14, features: ['Subclass feature'], subclassFeature: true },
    { level: 15, features: ['Psionic Dominance: cast Dominate Person once per Long Rest without a spell slot'], newSpellLevel: 8 },
    { level: 16, features: [],
                 choices: [ASI] },
    { level: 17, features: ['Absolute Focus: while concentrating, you cannot be Surprised and have advantage on Initiative'], newSpellLevel: 9 },
    { level: 18, features: ['Psionic Mastery: cast two concentration spells simultaneously (the second doesn\'t require concentration)'],
                 choices: [
                   { type: 'other', label: 'Psionic Mastery: choose a 2nd-level or lower spell — it can be maintained alongside a concentration spell' } ], subclassFeature: true },
    { level: 19, features: [],
                 choices: [ASI, EPIC] },
    { level: 20, features: ['Psionic Transcendence: your INT score increases by 4 (max 25). Immune to Psychic damage. Cast Telepathy and Foresight once per Long Rest without slot']  } ],

  Wizard: [
    { level: 1,  features: ['Arcane Recovery (Short Rest: recover slots = ½ level)', 'Spellbook (6 spells)', 'Spellcasting (3 cantrips)'] },
    { level: 2,  features: ['Scholar (1 extra language or tool proficiency)'] },
    { level: 3,  features: [],
                 choices: [
                   { type: 'subclass', label: 'Choose Arcane Tradition (school of magic)' } ], newSpellLevel: 2 },
    { level: 4,  features: [],
                 choices: [ASI] },
    { level: 5,  features: [], newSpellLevel: 3 },
    { level: 6,  features: ['Memorize Spell (re-prepare 1 spell on Short Rest)'], subclassFeature: true, newSpellLevel: 4 },
    { level: 7,  features: [] },
    { level: 8,  features: [], choices: [ASI] },
    { level: 9,  features: [], newSpellLevel: 5 },
    { level: 10, features: [], subclassFeature: true },
    { level: 11, features: [], newSpellLevel: 6 },
    { level: 12, features: [], choices: [ASI] },
    { level: 13, features: [], newSpellLevel: 7 },
    { level: 14, features: [], subclassFeature: true },
    { level: 15, features: [], newSpellLevel: 8 },
    { level: 16, features: [], choices: [ASI] },
    { level: 17, features: [], newSpellLevel: 9 },
    { level: 18, features: [],
                 choices: [
                   { type: 'other', label: 'Spell Mastery: choose 1 spell of 1st and 2nd level, cast without slot' } ], subclassFeature: true },
    { level: 19, features: [],
                 choices: [ASI, EPIC] },
    { level: 20, features: [],
                 choices: [
                   { type: 'other', label: 'Signature Spells: 2 spells of 3rd level or lower always prepared, cast 1/day free' } ] } ],
};

/** How many HP are gained at each level after 1 using average method (floor(hit_die/2) + 1). */
export function hpPerLevel(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

/**
 * Calculate total max HP for a character at the given level using average HP
 * per level (the standard choice for most players).
 * Level 1: hitDie + CON mod. Each level after: hpPerLevel(hitDie) + CON mod.
 */
export function calcMaxHP(hitDie: number, constitutionScore: number, level: number): number {
  const conMod = Math.floor((constitutionScore - 10) / 2);
  const level1HP = hitDie + conMod;
  const additionalHP = (level - 1) * (hpPerLevel(hitDie) + conMod);
  return Math.max(1, level1HP + additionalHP);
}
