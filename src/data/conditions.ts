import type { ConditionData } from '../types';

export interface ConditionMechanic {
  name: string;
  description: string;
  effects: string[];
  attackDisadvantage?: boolean;
  attackAdvantageReceived?: boolean;
  savingThrowDisadvantage?: ('strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma')[];
  autoFailSaves?: ('strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma')[];
  abilityCheckDisadvantage?: boolean;
  speedZero?: boolean;
  // v2.135.0 — Phase L pt 3: used by Encumbered. Speed is halved rather
  // than zeroed. Consumed by conditionsSpeedHalved(); full movement-code
  // integration is future polish (v2.136+).
  speedHalved?: boolean;
  concentrationBreaks?: boolean;
  cantAct?: boolean;
  cantReact?: boolean;
  cantMove?: boolean;
  critWithin5ft?: boolean;
  resistanceAll?: boolean;
  color: string;
  icon: string;
}

export const CONDITIONS: ConditionMechanic[] = [
  { name: 'Blinded', description: "Can't see.", effects: ["Fails sight-based checks.", "Attacks have disadvantage.", "Enemies attack with advantage."], attackDisadvantage: true, attackAdvantageReceived: true, color: '#64748b', icon: '' },
  { name: 'Charmed', description: "Regards charmer as friend.", effects: ["Can't attack the charmer.", "Charmer has social advantage."], color: '#ec4899', icon: '' },
  { name: 'Deafened', description: "Can't hear.", effects: ["Fails hearing-based checks."], color: '#94a3b8', icon: '' },
  { name: 'Exhaustion', description: "2024: -2 to all d20 rolls and -5ft speed per level. Level 6 = death.", effects: ["Level 1: -2 d20, -5ft speed.", "Level 2: -4 d20, -10ft speed.", "Level 3: -6 d20, -15ft speed.", "Level 4: -8 d20, -20ft speed.", "Level 5: -10 d20, -25ft speed.", "Level 6: Death."], color: '#f59e0b', icon: '' },
  { name: 'Frightened', description: "Afraid of a specific source.", effects: ["Disadvantage on attacks and checks while source is visible.", "Can't approach source."], attackDisadvantage: true, abilityCheckDisadvantage: true, color: '#7c3aed', icon: '' },
  { name: 'Grappled', description: "Speed becomes 0.", effects: ["Speed 0.", "Ends if grappler is incapacitated."], speedZero: true, color: '#92400e', icon: '' },
  { name: 'Incapacitated', description: "Can't act or react.", effects: ["No actions.", "No reactions.", "Concentration breaks."], cantAct: true, cantReact: true, concentrationBreaks: true, color: '#dc2626', icon: '' },
  { name: 'Invisible', description: "Can't be seen normally.", effects: ["Your attacks have advantage.", "Enemies attack with disadvantage."], color: '#6366f1', icon: '' },
  { name: 'Paralyzed', description: "Incapacitated, can't move or speak.", effects: ["No actions or reactions.", "Can't move.", "Auto-fail Str/Dex saves.", "Attacks have advantage.", "Within 5ft = critical hit."], cantAct: true, cantReact: true, cantMove: true, concentrationBreaks: true, autoFailSaves: ['strength', 'dexterity'], attackAdvantageReceived: true, critWithin5ft: true, color: '#b91c1c', icon: '' },
  { name: 'Petrified', description: "Turned to stone. Resistant to all damage.", effects: ["Incapacitated.", "Auto-fail Str/Dex saves.", "Attacks have advantage.", "Resistance to all damage."], cantAct: true, cantReact: true, cantMove: true, concentrationBreaks: true, autoFailSaves: ['strength', 'dexterity'], attackAdvantageReceived: true, resistanceAll: true, color: '#78716c', icon: '' },
  { name: 'Poisoned', description: "Disadvantage on attacks and checks.", effects: ["Attacks have disadvantage.", "Ability checks have disadvantage."], attackDisadvantage: true, abilityCheckDisadvantage: true, color: '#15803d', icon: '' },
  { name: 'Prone', description: "On the ground. Stand uses half speed.", effects: ["Attacks have disadvantage.", "Attacks within 5ft against you have advantage."], attackDisadvantage: true, attackAdvantageReceived: true, color: '#78350f', icon: '' },
  { name: 'Restrained', description: "Speed 0, attack disadvantage.", effects: ["Speed 0.", "Attacks have disadvantage.", "Enemies attack with advantage.", "Disadvantage on Dex saves."], speedZero: true, attackDisadvantage: true, attackAdvantageReceived: true, savingThrowDisadvantage: ['dexterity'], color: '#7f1d1d', icon: '' },
  { name: 'Stunned', description: "Overwhelmed — incapacitated.", effects: ["No actions or reactions.", "Can't move.", "Auto-fail Str/Dex saves.", "Attacks have advantage."], cantAct: true, cantReact: true, cantMove: true, concentrationBreaks: true, autoFailSaves: ['strength', 'dexterity'], attackAdvantageReceived: true, color: '#7c3aed', icon: '' },
  { name: 'Unconscious', description: "Inert. Auto-crits from within 5ft.", effects: ["Incapacitated, falls prone.", "Auto-fail Str/Dex saves.", "Attacks have advantage.", "Within 5ft = critical hit."], cantAct: true, cantReact: true, cantMove: true, concentrationBreaks: true, autoFailSaves: ['strength', 'dexterity'], attackAdvantageReceived: true, critWithin5ft: true, color: '#1e1b4b', icon: '' },
  { name: 'Bloodied', description: "Below half HP. Some monsters react.", effects: ["No direct mechanical effect.", "Some monsters have Bloodied reactions."], color: '#dc2626', icon: '' },
  // v2.135.0 — Phase L pt 3: auto-applied/removed by syncEncumbranceCondition
  // when a character's carried weight exceeds their capacity. Not a RAW
  // "condition" per se — the PHB describes Encumbered as a state rather
  // than listing it with the 14 formal conditions — but routing it through
  // the same pipeline lets it participate in the existing disadvantage/
  // speed-penalty machinery. RAW 2024 p.29: disadvantage on STR/DEX/CON
  // ability checks, saves, and attack rolls; speed halved. The
  // attackDisadvantage flag here is a broad approximation (covers
  // non-STR-based attacks too) — DM adjudicates finesse weapons etc.
  { name: 'Encumbered', description: "Overburdened. Speed halved, disadvantage on STR/DEX/CON rolls.", effects: ["Speed halved.", "Disadvantage on attacks.", "Disadvantage on STR/DEX/CON checks + saves."], attackDisadvantage: true, savingThrowDisadvantage: ['strength','dexterity','constitution'], speedHalved: true, color: '#a16207', icon: '' },
  // v2.147.0 — Phase N pt 5: distinct tier-2 condition for the optional
  // 3-tier variant rule (campaigns.encumbrance_variant='variant'). Tier 1
  // uses Encumbered above, tier 2 (over 10× STR) uses HeavilyEncumbered.
  // Mechanics are identical to Encumbered for implementation simplicity —
  // the visible difference is the deeper red-orange color so the DM can
  // tell at a glance which tier a character is in. RAW 2014 DMG variant
  // tier 2 specifies an additional −10 ft flat penalty beyond tier 1's
  // −10 ft; we approximate both tiers with "speed halved" until a future
  // ship adds flat speed-penalty support to the condition system.
  { name: 'HeavilyEncumbered', description: "Overburdened beyond tier 1 (variant rule). Speed halved, disadvantage on STR/DEX/CON rolls.", effects: ["Speed halved.", "Disadvantage on attacks.", "Disadvantage on STR/DEX/CON checks + saves."], attackDisadvantage: true, savingThrowDisadvantage: ['strength','dexterity','constitution'], speedHalved: true, color: '#dc2626', icon: '' },
];

export const CONDITION_MAP: Record<string, ConditionMechanic> = Object.fromEntries(
  CONDITIONS.map(c => [c.name, c])
);
