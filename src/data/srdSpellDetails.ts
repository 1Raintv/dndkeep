// v2.749 — Complete text for this audited batch, not a license claim for the whole catalog.
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1")
// by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd.
// The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International
// License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
// Changes: PDF line wrapping/hyphenation removed; paragraph breaks restored;
// higher-level text separated; casting-time labels normalized for the app.
// Source: https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf
import type { SpellData } from '../types';

type SrdDetails = Pick<SpellData, 'name' | 'casting_time' | 'range' | 'components' |
  'duration' | 'concentration' | 'description' | 'rules_source'> & { higher_levels: string | null };

export const SRD_SPELL_DETAILS: Record<string, SrdDetails> = {
  "aid": {
    "name": "Aid",
    "casting_time": "1 action",
    "range": "30 feet",
    "components": "V, S, M (a strip of white cloth)",
    "duration": "8 hours",
    "concentration": false,
    "description": "Choose up to three creatures within range. Each target’s Hit Point maximum and current Hit Points increase by 5 for the duration.",
    "higher_levels": "Each target’s Hit Points increase by 5 for each spell slot level above 2.",
    "rules_source": {
      "version": "5.2.1",
      "page": 107
    }
  },
  "bless": {
    "name": "Bless",
    "casting_time": "1 action",
    "range": "30 feet",
    "components": "V, S, M (a Holy Symbol worth 5+ GP)",
    "duration": "Concentration, up to 1 minute",
    "concentration": true,
    "description": "You bless up to three creatures within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target adds 1d4 to the attack roll or save.",
    "higher_levels": "You can target one additional creature for each spell slot level above 1.",
    "rules_source": {
      "version": "5.2.1",
      "page": 113
    }
  },
  "counterspell": {
    "name": "Counterspell",
    "casting_time": "1 reaction, which you take when you see a creature within 60 feet of yourself casting a spell with Verbal, Somatic, or Material components",
    "range": "60 feet",
    "components": "S",
    "duration": "Instantaneous",
    "concentration": false,
    "description": "You attempt to interrupt a creature in the process of casting a spell. The creature makes a Constitution saving throw. On a failed save, the spell dissipates with no effect, and the action, Bonus Action, or Reaction used to cast it is wasted. If that spell was cast with a spell slot, the slot isn’t expended.",
    "higher_levels": null,
    "rules_source": {
      "version": "5.2.1",
      "page": 120
    }
  },
  "dispel-magic": {
    "name": "Dispel Magic",
    "casting_time": "1 action",
    "range": "120 feet",
    "components": "V, S",
    "duration": "Instantaneous",
    "concentration": false,
    "description": "Choose one creature, object, or magical effect within range. Any ongoing spell of level 3 or lower on the target ends. For each ongoing spell of level 4 or higher on the target, make an ability check using your spellcasting ability (DC 10 plus that spell’s level). On a successful check, the spell ends.",
    "higher_levels": "You automatically end a spell on the target if the spell’s level is equal to or less than the level of the spell slot you use.",
    "rules_source": {
      "version": "5.2.1",
      "page": 124
    }
  },
  "false-life": {
    "name": "False Life",
    "casting_time": "1 action",
    "range": "Self",
    "components": "V, S, M (a drop of alcohol)",
    "duration": "Instantaneous",
    "concentration": false,
    "description": "You gain 2d4 + 4 Temporary Hit Points.",
    "higher_levels": "You gain 5 additional Temporary Hit Points for each spell slot level above 1.",
    "rules_source": {
      "version": "5.2.1",
      "page": 129
    }
  },
  "guidance": {
    "name": "Guidance",
    "casting_time": "1 action",
    "range": "Touch",
    "components": "V, S",
    "duration": "Concentration, up to 1 minute",
    "concentration": true,
    "description": "You touch a willing creature and choose a skill. Until the spell ends, the creature adds 1d4 to any ability check using the chosen skill.",
    "higher_levels": null,
    "rules_source": {
      "version": "5.2.1",
      "page": 138
    }
  },
  "haste": {
    "name": "Haste",
    "casting_time": "1 action",
    "range": "30 feet",
    "components": "V, S, M (a shaving of licorice root)",
    "duration": "Concentration, up to 1 minute",
    "concentration": true,
    "description": "Choose a willing creature that you can see within range. Until the spell ends, the target’s Speed is doubled, it gains a +2 bonus to Armor Class, it has Advantage on Dexterity saving throws, and it gains an additional action on each of its turns. That action can be used to take only the Attack (one attack only), Dash, Disengage, Hide, or Utilize action.\n\nWhen the spell ends, the target is Incapacitated and has a Speed of 0 until the end of its next turn, as a wave of lethargy washes over it.",
    "higher_levels": null,
    "rules_source": {
      "version": "5.2.1",
      "page": 139
    }
  },
  "hold-person": {
    "name": "Hold Person",
    "casting_time": "1 action",
    "range": "60 feet",
    "components": "V, S, M (a straight piece of iron)",
    "duration": "Concentration, up to 1 minute",
    "concentration": true,
    "description": "Choose a Humanoid that you can see within range. The target must succeed on a Wisdom saving throw or have the Paralyzed condition for the duration. At the end of each of its turns, the target repeats the save, ending the spell on itself on a success.",
    "higher_levels": "You can target one additional Humanoid for each spell slot level above 2.",
    "rules_source": {
      "version": "5.2.1",
      "page": 141
    }
  },
  "invisibility": {
    "name": "Invisibility",
    "casting_time": "1 action",
    "range": "Touch",
    "components": "V, S, M (an eyelash in gum arabic)",
    "duration": "Concentration, up to 1 hour",
    "concentration": true,
    "description": "A creature you touch has the Invisible condition until the spell ends. The spell ends early immediately after the target makes an attack roll, deals damage, or casts a spell.",
    "higher_levels": "You can target one additional creature for each spell slot level above 2.",
    "rules_source": {
      "version": "5.2.1",
      "page": 143
    }
  },
  "jump": {
    "name": "Jump",
    "casting_time": "1 bonus action",
    "range": "Touch",
    "components": "V, S, M (a grasshopper’s hind leg)",
    "duration": "1 minute",
    "concentration": false,
    "description": "You touch a willing creature. Once on each of its turns until the spell ends, that creature can jump up to 30 feet by spending 10 feet of movement.",
    "higher_levels": "You can target one additional creature for each spell slot level above 1.",
    "rules_source": {
      "version": "5.2.1",
      "page": 143
    }
  },
  "mage-hand": {
    "name": "Mage Hand",
    "casting_time": "1 action",
    "range": "30 feet",
    "components": "V, S",
    "duration": "1 minute",
    "concentration": false,
    "description": "A spectral, floating hand appears at a point you choose within range. The hand lasts for the duration. The hand vanishes if it is ever more than 30 feet away from you or if you cast this spell again.\n\nWhen you cast the spell, you can use the hand to manipulate an object, open an unlocked door or container, stow or retrieve an item from an open container, or pour the contents out of a vial.\n\nAs a Magic action on your later turns, you can control the hand thus again. As part of that action, you can move the hand up to 30 feet.\n\nThe hand can’t attack, activate magic items, or carry more than 10 pounds.",
    "higher_levels": null,
    "rules_source": {
      "version": "5.2.1",
      "page": 145
    }
  },
  "polymorph": {
    "name": "Polymorph",
    "casting_time": "1 action",
    "range": "60 feet",
    "components": "V, S, M (a caterpillar cocoon)",
    "duration": "Concentration, up to 1 hour",
    "concentration": true,
    "description": "You attempt to transform a creature that you can see within range into a Beast. The target must succeed on a Wisdom saving throw or shape-shift into a Beast form for the duration. That form can be any Beast you choose that has a Challenge Rating equal to or less than the target’s (or the target’s level if it doesn’t have a Challenge Rating). The target’s game statistics are replaced by the stat block of the chosen Beast, but the target retains its alignment, personality, creature type, Hit Points, and Hit Point Dice. See the “Animals” section of “Monsters” for a sample of Beast stat blocks.\n\nThe target gains a number of Temporary Hit Points equal to the Hit Points of the Beast form. These Temporary Hit Points vanish if any remain when the spell ends. The spell ends early on the target if it has no Temporary Hit Points left.\n\nThe target is limited in the actions it can perform by the anatomy of its new form, and it can’t speak or cast spells.\n\nThe target’s gear melds into the new form. The creature can’t use or otherwise benefit from any of that equipment.",
    "higher_levels": null,
    "rules_source": {
      "version": "5.2.1",
      "page": 153
    }
  },
  "shield": {
    "name": "Shield",
    "casting_time": "1 reaction, which you take when you are hit by an attack roll or targeted by the Magic Missile spell",
    "range": "Self",
    "components": "V, S",
    "duration": "1 round",
    "concentration": false,
    "description": "An imperceptible barrier of magical force protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from Magic Missile.",
    "higher_levels": null,
    "rules_source": {
      "version": "5.2.1",
      "page": 161
    }
  },
  "sleep": {
    "name": "Sleep",
    "casting_time": "1 action",
    "range": "60 feet",
    "components": "V, S, M (a pinch of sand or rose petals)",
    "duration": "Concentration, up to 1 minute",
    "concentration": true,
    "description": "Each creature of your choice in a 5-foot-radius Sphere centered on a point within range must succeed on a Wisdom saving throw or have the Incapacitated condition until the end of its next turn, at which point it must repeat the save. If the target fails the second save, the target has the Unconscious condition for the duration. The spell ends on a target if it takes damage or someone within 5 feet of it takes an action to shake it out of the spell’s effect.\n\nCreatures that don’t sleep, such as elves, or that have Immunity to the Exhaustion condition automatically succeed on saves against this spell.",
    "higher_levels": null,
    "rules_source": {
      "version": "5.2.1",
      "page": 163
    }
  },
  "suggestion": {
    "name": "Suggestion",
    "casting_time": "1 action",
    "range": "30 feet",
    "components": "V, M (a drop of honey)",
    "duration": "Concentration, up to 8 hours",
    "concentration": true,
    "description": "You suggest a course of activity—described in no more than 25 words—to one creature you can see within range that can hear and understand you. The suggestion must sound achievable and not involve anything that would obviously deal damage to the target or its allies. For example, you could say, “Fetch the key to the cult’s treasure vault, and give the key to me.” Or you could say, “Stop fighting, leave this library peacefully, and don’t return.”\n\nThe target must succeed on a Wisdom saving throw or have the Charmed condition for the duration or until you or your allies deal damage to the target. The Charmed target pursues the suggestion to the best of its ability. The suggested activity can continue for the entire duration, but if the suggested activity can be completed in a shorter time, the spell ends for the target upon completing it.",
    "higher_levels": null,
    "rules_source": {
      "version": "5.2.1",
      "page": 166
    }
  }
};

/** Only canonical records: a matching homebrew name/ID never grants SRD provenance. */
export function applySrdSpellDetails(spell: SpellData, canonical: boolean): SpellData {
  const details = SRD_SPELL_DETAILS[spell.id];
  if (!canonical || (spell.source && spell.source !== 'srd') || !details || details.name !== spell.name) return spell;
  // These fifteen spells deal no damage. Remove legacy Sleep HP-pool dice and
  // stale DB fields so the visible rules and cast controls cannot disagree.
  const saves: Record<string, string> = { counterspell: 'CON', 'hold-person': 'WIS', polymorph: 'WIS', sleep: 'WIS', suggestion: 'WIS' };
  return {
    ...spell, ...details, higher_levels: details.higher_levels ?? undefined,
    damage_dice: undefined, damage_type: undefined, damage_at_slot_level: undefined,
    damage_at_char_level: undefined, attack_type: undefined,
    save_type: saves[spell.id],
    area_of_effect: spell.id === 'sleep' ? { type: 'sphere', size: 5 } : undefined,
    heal_dice: spell.id === 'false-life' ? '2d4 + 4' : undefined,
    heal_at_slot_level: spell.id === 'false-life'
      ? Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index + 1), `2d4 + ${4 + index * 5}`]))
      : undefined,
  };
}
