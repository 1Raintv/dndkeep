// src/lib/abilityChecks.ts
//
// v2.163.0 — Phase Q.0 pt 4: ability checks helper.
//
// Pure functions for rolling skill checks and raw ability checks for
// a character. Used by:
//   • DM PartyDashboard "Roll Secret" button (DM rolls on player's
//     behalf without broadcasting the result)
//   • DM PartyDashboard "Prompt Player" button (broadcasts a
//     check_prompt message; player UI calls rollCheck themselves)
//
// Skill modifier formula (RAW):
//   ability_modifier + (proficient ? proficiency_bonus : 0)
//   ability_modifier + (expert ? proficiency_bonus * 2 : 0)
// Raw ability check: just the ability modifier, no proficiency.

import type { Character, AbilityKey } from '../types';
import { SKILL_MAP } from '../data/skills';
import { abilityModifier, proficiencyBonus } from './gameUtils';

export type CheckTarget =
  | { kind: 'skill'; name: string }    // e.g. "Stealth"
  | { kind: 'ability'; ability: AbilityKey }
  // v2.168.0 — Phase Q.0 pt 9: save variant. Used by the DM
  // ChecksPanel to show per-character saving-throw modifiers and roll
  // them secretly. Broadcast save prompts still use the existing
  // save_prompt message_type (see ChecksPanel.promptPlayer).
  | { kind: 'save'; ability: AbilityKey };

export interface CheckRollResult {
  d20: number;
  /** Both dice if rolled with advantage/disadvantage. */
  d20Rolls: number[];
  modifier: number;
  total: number;
  /** "Stealth", "STR check" — display label */
  label: string;
  /** Whether the character is proficient (for skills). False for raw ability checks. */
  proficient: boolean;
  /** Whether the character has expertise (skill only). */
  expert: boolean;
  advantage: boolean;
  disadvantage: boolean;
}

/**
 * Compute the modifier for a skill or ability check.
 * Pure function — no rolling.
 */
export function checkModifier(
  character: Character,
  target: CheckTarget,
): { mod: number; proficient: boolean; expert: boolean; ability: AbilityKey } {
  const pb = proficiencyBonus(character.level);

  if (target.kind === 'ability') {
    const score = character[target.ability] ?? 10;
    return {
      mod: abilityModifier(score),
      proficient: false,
      expert: false,
      ability: target.ability,
    };
  }

  // v2.168.0 — save variant. Save modifier = ability mod + PB if the
  // character is proficient in that save. No expertise on saves.
  if (target.kind === 'save') {
    const score = character[target.ability] ?? 10;
    const mod = abilityModifier(score);
    const proficient = (character.saving_throw_proficiencies ?? []).includes(target.ability);
    return {
      mod: mod + (proficient ? pb : 0),
      proficient,
      expert: false,
      ability: target.ability,
    };
  }

  // Skill
  const skill = SKILL_MAP[target.name];
  if (!skill) {
    // Unknown skill — treat as 0 mod, no proficiency
    return { mod: 0, proficient: false, expert: false, ability: 'strength' };
  }
  const score = character[skill.ability] ?? 10;
  const mod = abilityModifier(score);
  const proficient = (character.skill_proficiencies ?? []).includes(target.name);
  const expert = (character.skill_expertises ?? []).includes(target.name);
  const bonus = expert ? pb * 2 : proficient ? pb : 0;
  return {
    mod: mod + bonus,
    proficient,
    expert,
    ability: skill.ability,
  };
}

/** Roll a d20 (or 2d20 with adv/dis), apply modifier. Pure rolling. */
export function rollCheck(
  character: Character,
  target: CheckTarget,
  opts: { advantage?: boolean; disadvantage?: boolean } = {},
): CheckRollResult {
  const advantage = !!opts.advantage && !opts.disadvantage;
  const disadvantage = !!opts.disadvantage && !opts.advantage;

  const rolls: number[] = [];
  if (advantage || disadvantage) {
    rolls.push(rollD20(), rollD20());
  } else {
    rolls.push(rollD20());
  }
  const d20 =
    advantage ? Math.max(...rolls) :
    disadvantage ? Math.min(...rolls) :
    rolls[0];

  const { mod, proficient, expert } = checkModifier(character, target);
  const total = d20 + mod;
  const label =
    target.kind === 'skill' ? target.name :
    target.kind === 'save' ? `${target.ability.slice(0, 3).toUpperCase()} save` :
    `${target.ability.slice(0, 3).toUpperCase()} check`;

  return {
    d20,
    d20Rolls: rolls,
    modifier: mod,
    total,
    label,
    proficient,
    expert,
    advantage,
    disadvantage,
  };
}

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/** Wire-format payload broadcast in campaign_chat for check_prompt messages. */
export interface CheckPromptPayload {
  /** "Stealth" or "STR" or "DEX" etc. */
  target: string;
  kind: 'skill' | 'ability';
  /** Optional DC for context. Player still rolls regardless. */
  dc?: number;
  advantage?: boolean;
  disadvantage?: boolean;
}

export function encodeCheckPrompt(p: CheckPromptPayload): string {
  return JSON.stringify(p);
}

export function decodeCheckPrompt(json: string): CheckPromptPayload | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed?.target === 'string' && (parsed?.kind === 'skill' || parsed?.kind === 'ability')) {
      return parsed as CheckPromptPayload;
    }
    return null;
  } catch {
    return null;
  }
}
