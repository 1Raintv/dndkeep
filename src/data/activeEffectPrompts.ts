// v2.597.0 — Active-effect turn prompts (SPELL_AUTOMATION_AUDIT Tier 1).
//
// Registry of spells that, WHILE ACTIVE, grant a recurring action or
// bonus action the player is likely to forget (the Heat Metal
// problem). The character sheet renders a persistent prompt row under
// the concentration banner for any registered spell the character is
// concentrating on: economy chip + short RAW summary + a one-click
// Use/Roll button that spends the action-economy token and (when the
// spell entry carries dice) rolls them.
//
// RULES SAFETY: this file NEVER carries dice or DCs of its own. Any
// numbers shown/rolled are read at runtime from the spell catalogue
// entry (damage_dice / heal_dice / damage_type / save_type) so the
// prompt can't drift from the spell data. `rollKind` only says WHICH
// catalogue field to read. Entries here are limited to concentration
// spells (the banner is keyed on concentration_spell); non-
// concentration recurrers (e.g. Mage Hand) need the duration-effect
// tracker planned as a later ship.
//
// Wave 1 scope: prompts + economy spend + dice. NOT yet: map-token
// movement (Tier 2), start-of-turn ticks (Tier 3), upcast dice
// scaling (needs the cast slot level persisted with concentration).

export interface ActiveEffectPrompt {
  /** 'bonus' | 'action' — which economy token the recurring use costs. */
  economy: 'bonus' | 'action';
  /** Button-adjacent label, e.g. "Scorch again". */
  label: string;
  /** One-line RAW summary shown next to the label. */
  detail: string;
  /** Which catalogue dice field powers the Roll button. Omit for
   *  no-roll prompts (movement/command effects). */
  rollKind?: 'damage' | 'heal';
  /** Show the target save (spell save_type + caster DC) next to the
   *  detail line. */
  showSave?: boolean;
}

export const ACTIVE_EFFECT_PROMPTS: Record<string, ActiveEffectPrompt> = {
  'heat-metal': {
    economy: 'bonus', label: 'Scorch again', rollKind: 'damage', showSave: true,
    detail: 'Re-deal the damage to whatever touches the metal',
  },
  'spiritual-weapon': {
    economy: 'bonus', label: 'Move 20 ft + attack', rollKind: 'damage',
    detail: 'Melee spell attack with the spectral weapon',
  },
  'flaming-sphere': {
    economy: 'bonus', label: 'Move 30 ft / ram', rollKind: 'damage', showSave: true,
    detail: 'Ram a creature: Dex save or take the damage; sphere stops',
  },
  'aura-of-vitality': {
    economy: 'bonus', label: 'Heal', rollKind: 'heal',
    detail: 'Restore hit points to one creature in the aura',
  },
  'call-lightning': {
    economy: 'action', label: 'Call a bolt', rollKind: 'damage', showSave: true,
    detail: 'Strike a point you can see under the cloud',
  },
  'witch-bolt': {
    economy: 'bonus', label: 'Arc damage', rollKind: 'damage',
    detail: 'Automatic damage down the tether',
  },
  'moonbeam': {
    economy: 'action', label: 'Move the beam',
    detail: 'Shift the beam up to 60 ft; damage triggers on entry / turn start',
  },
  'vampiric-touch': {
    economy: 'action', label: 'Draining touch', rollKind: 'damage',
    detail: 'Melee spell attack; regain half the necrotic damage dealt',
  },
  'flame-blade': {
    economy: 'action', label: 'Blade attack', rollKind: 'damage',
    detail: 'Melee spell attack with the fiery blade',
  },
  'crown-of-madness': {
    economy: 'action', label: 'Maintain control',
    detail: 'Required each turn or the spell releases the target',
  },
  'expeditious-retreat': {
    economy: 'bonus', label: 'Dash',
    detail: 'The spell lets you Dash as a bonus action every turn',
  },
  'dancing-lights': {
    economy: 'bonus', label: 'Move the lights',
    detail: 'Reposition the lights up to 60 ft',
  },
  'telekinesis': {
    economy: 'action', label: 'Sustain / move target',
    detail: 'Keep or switch your telekinetic hold',
  },
  'sunbeam': {
    economy: 'action', label: 'Another beam', rollKind: 'damage', showSave: true,
    detail: 'Fire a fresh beam from your hand',
  },
  'eyebite': {
    economy: 'action', label: 'Target another creature', showSave: true,
    detail: 'Force a new target to save against the chosen effect',
  },
  'animate-objects': {
    economy: 'bonus', label: 'Command objects',
    detail: 'Direct every animated object at once',
  },
  'arcane-hand': {
    economy: 'bonus', label: 'Command the hand',
    detail: 'Move the hand and choose its mode (fist / push / grasp / wall)',
  },
  'arcane-sword': {
    economy: 'bonus', label: 'Move 20 ft + attack', rollKind: 'damage',
    detail: 'Melee spell attack with the spectral sword',
  },
  'compulsion': {
    economy: 'bonus', label: 'Designate direction', showSave: true,
    detail: 'Choose where compelled targets must move',
  },
  'gust-of-wind': {
    economy: 'bonus', label: 'Change direction',
    detail: 'Point the line of wind a new way',
  },
  'hex': {
    economy: 'bonus', label: 'Move curse',
    detail: 'When the target drops to 0 HP: curse a new creature',
  },
  'hunters-mark': {
    economy: 'bonus', label: 'Move mark',
    detail: 'When the target drops to 0 HP: mark a new creature',
  },
  'mislead': {
    economy: 'action', label: 'Control the double',
    detail: 'Move the illusory double and swap senses',
  },
  'project-image': {
    economy: 'action', label: 'Move the image',
    detail: 'Move the illusion up to twice your speed; use its senses',
  },
  'dominate-beast': {
    economy: 'action', label: 'Precise control',
    detail: 'Take total, precise control of the target this turn',
  },
  'dominate-person': {
    economy: 'action', label: 'Precise control',
    detail: 'Take total, precise control of the target this turn',
  },
  'dominate-monster': {
    economy: 'action', label: 'Precise control',
    detail: 'Take total, precise control of the target this turn',
  },
};
