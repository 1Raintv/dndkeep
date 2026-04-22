// src/lib/automations.ts
//
// v2.26.0 — Automation framework foundation.
//
// Three-tier override model:
//   DM campaign default  ─┐
//   ├── if character has advanced_automations_unlocked = true
//   │   AND automation_overrides[key] is set  →  use character override
//   └── else                                   →  use campaign default
//   └── else (no campaign default)             →  use built-in REGISTRY default
//
// Add a new automation by:
//   1. Adding an entry to AUTOMATIONS below
//   2. Reading its value at the call site via resolveAutomation(key, character, campaign)
//   3. Branching on 'off' | 'prompt' | 'auto'
//
// The DM Automations settings UI and Character Automations tab both iterate
// the REGISTRY so new entries surface automatically.

import type { Character, Campaign } from '../types';

export type AutomationValue = 'off' | 'prompt' | 'auto';

export interface AutomationDef {
  /** Stable key used in jsonb blobs and the UI. Never rename once shipped. */
  key: string;
  /** Short human label shown next to the radio. */
  label: string;
  /** One-sentence explanation shown beneath the label. */
  description: string;
  /** Built-in fallback when neither the character nor the campaign sets a value. */
  default: AutomationValue;
  /** Allowed values. Usually all three, but some automations may only support a subset. */
  allowed: readonly AutomationValue[];
}

// ─── Registry ───────────────────────────────────────────────────────
// Add new automations here. Order here is the order shown in the UI.

export const AUTOMATIONS: readonly AutomationDef[] = [
  {
    key: 'concentration_on_damage',
    label: 'Concentration check on damage',
    description:
      'When a concentrating character takes damage, roll a CON save at DC max(10, half damage) per source. Off: no prompt. Prompt: popup with one-click roll. Auto: rolls automatically and drops concentration on a fail.',
    default: 'prompt',
    allowed: ['off', 'prompt', 'auto'] as const,
  },
  {
    key: 'opportunity_attack_offers',
    label: 'Opportunity Attack offers',
    description:
      "When a creature moves out of another creature's 5-ft reach, offer the reactor a chance to make an Opportunity Attack. Off: no offers (gritty RAW manual call-out). Auto: offer appears automatically. Prompt currently behaves like Auto since the offer itself is the prompt.",
    default: 'auto',
    allowed: ['off', 'auto'] as const,
  },
  {
    key: 'condition_cascade_auto',
    label: 'Auto-cascade conditions',
    description:
      'When a condition like Unconscious or Paralyzed is applied, automatically also apply the conditions it implies (Unconscious → Prone + Incapacitated; Paralyzed/Stunned/Petrified → Incapacitated). Off: only the named condition is applied — DM manages cascades manually. Auto: cascades fire per 2024 PHB.',
    default: 'auto',
    allowed: ['off', 'auto'] as const,
  },
  {
    key: 'absorb_elements_rider_auto',
    label: 'Auto-apply Absorb Elements rider',
    description:
      "When Absorb Elements is cast as a reaction, automatically apply the +1d6 melee damage rider buff to the caster. Off: damage is halved but the rider must be tracked manually (the player can apply it via the buff UI). Auto: buff applied automatically and consumed on the next melee hit.",
    default: 'auto',
    allowed: ['off', 'auto'] as const,
  },
  {
    key: 'death_save_on_turn_start',
    label: 'Death saves at turn start',
    description:
      'When a downed character starts their turn at 0 HP, roll a death save (d20 ≥ 10 succeeds, nat 1 = 2 failures, nat 20 wakes with 1 HP). Off: DM manages death saves manually. Auto: rolls automatically and updates success/failure counters. Prompt: player sees a modal on their turn and clicks Roll to resolve.',
    default: 'auto',
    allowed: ['off', 'prompt', 'auto'] as const,
  },
  // Future automations go here. Keep key strings stable once shipped.
];

// Fast lookup
const REGISTRY_MAP: Record<string, AutomationDef> = Object.fromEntries(
  AUTOMATIONS.map(a => [a.key, a])
);

// ─── Resolution ─────────────────────────────────────────────────────

/**
 * Resolve the effective automation value for a given character in a campaign.
 *
 * @param key Automation key from the registry.
 * @param character The character whose sheet is being rendered. Pass undefined/null in DM contexts.
 * @param campaign The active campaign. Pass undefined/null outside a campaign (solo play).
 */
export function resolveAutomation(
  key: string,
  character: Pick<Character, 'automation_overrides' | 'advanced_automations_unlocked'> | null | undefined,
  campaign: Pick<Campaign, 'automation_defaults'> | null | undefined
): AutomationValue {
  const def = REGISTRY_MAP[key];
  if (!def) {
    // Unknown key — fail safe to off so unreleased features don't trigger.
    return 'off';
  }

  // 1. Character override (only if advanced automations unlocked)
  if (
    character?.advanced_automations_unlocked &&
    character.automation_overrides &&
    character.automation_overrides[key]
  ) {
    const v = character.automation_overrides[key];
    if (def.allowed.includes(v)) return v;
  }

  // 2. Campaign default
  if (campaign?.automation_defaults && campaign.automation_defaults[key]) {
    const v = campaign.automation_defaults[key];
    if (def.allowed.includes(v)) return v;
  }

  // 3. Built-in registry default
  return def.default;
}

/** Human-readable label for a value. Used by settings UIs. */
export function labelForValue(v: AutomationValue): string {
  switch (v) {
    case 'off': return 'Off';
    case 'prompt': return 'Prompt';
    case 'auto': return 'Auto';
  }
}
