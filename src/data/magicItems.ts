export type MagicItemRarity = 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact';
export type MagicItemType = 'armor' | 'potion' | 'ring' | 'rod' | 'scroll' | 'staff' | 'wand' | 'weapon' | 'wondrous' | 'ammunition';

// v2.327.0 — T5: ability-score override. RAW 2024 magic items like
// Gauntlets of Ogre Power and Headband of Intellect set the wearer's
// score to a fixed value while attuned + equipped, with the rule "no
// effect if your score is already that high or higher." The actual
// "no effect if higher" semantics live in lib/attunement.ts where
// overrides are aggregated — Math.max(base, override.value) per
// ability — so multiple overrides on the same ability also resolve
// correctly (only the highest applies). Lowercase ability keys to
// match the AbilityKey type used everywhere downstream.
export interface MagicItemAbilityOverride {
  ability: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
  value: number;
}

export interface MagicItem {
  id: string;
  name: string;
  type: MagicItemType;
  rarity: MagicItemRarity;
  requiresAttunement: boolean;
  description: string;
  weight?: number;
  // Mechanical bonuses — applied automatically when attuned + equipped
  acBonus?: number;
  saveBonus?: number;
  attackBonus?: number;
  damageBonus?: number;
  // v2.327.0 — T5: ability-score override (Gauntlets of Ogre Power,
  // Headband of Intellect, Belt of Giant Strength variants, etc.).
  // Applied via Math.max(base, value) in computeStats so existing
  // higher scores are preserved per RAW.
  abilityOverride?: MagicItemAbilityOverride;
  // v2.157.0 — Phase P pt 5: charges metadata from the DB.
  // Populated by the useMagicItems hook from the magic_items row.
  // maxCharges omitted or undefined = not a charged item.
  maxCharges?: number;
  recharge?: 'dawn' | 'dusk' | 'long_rest' | 'short_rest';
  rechargeDice?: string;
  // v2.181.0 — Phase Q.0 pt 22: canonical base damage for weapon-type
  // items, e.g. "1d8 slashing" for a Luck Blade (SRD longsword base).
  // Copied into InventoryItem.damage at add time so the Actions tab
  // weapon mapper can parse dice + type without special-casing magic
  // items. Undefined for non-weapons and for generic "Weapon, +N"
  // entries where the user should pick a concrete weapon instead.
  baseDamageDice?: string;
}

export const MAGIC_ITEMS: MagicItem[] = [
  // ───────────────────────────────────────────────────────────────────
  // v2.328.0 — T5b magic items catalog audit pass.
  //
  // Every entry below with `requiresAttunement: true` was reviewed for
  // structured-effect coverage. Items that DON'T have a numeric/schema
  // field today rely on the description text — which is the right call
  // when the RAW effect doesn't reduce to a clean type. The list of
  // intentionally-narrative attuneable effects (so future audits don't
  // re-litigate them):
  //
  //   • Damage-type resistances / immunities (Ring of Resistance, Ring
  //     of Warmth, Periapt of Proof Against Poison, Periapt of Health,
  //     Frost Brand fire resistance) — needs a damage-resistance field
  //     on the schema; deferred until the buff/condition system exposes
  //     resistance as a typed bonus.
  //
  //   • "Extra XdY damage on hit" weapons (Flame Tongue +2d6 fire,
  //     Frost Brand +1d6 cold) — needs a separate `bonusDamageDice`
  //     field with a damage type; today damageBonus is flat numeric.
  //
  //   • Weapon-type-restricted bonuses (Bracers of Archery +2 dmg with
  //     bows only) — needs a weapon-category constraint on the bonus.
  //
  //   • At-will / charged spell items (Hat of Disguise, Helm of
  //     Comprehending Languages, Cape of the Mountebank, Crystal Ball,
  //     Wand of *, Staff of *, Rod of Rulership, Eyes of Charming,
  //     Medallion of Thoughts, Helm of Brilliance, Helm of
  //     Teleportation) — RP-only flow today. Charges already track via
  //     `maxCharges` + `recharge`; the cast itself stays narrative.
  //
  //   • Movement / sense overrides (Boots of Speed/Striding/Flying,
  //     Slippers of Spider Climbing, Ioun Stone Sustenance, Goggles
  //     of Night, Eyes of the Eagle, Cloak of Elvenkind/Displacement,
  //     Lantern of Revealing) — narrative; no numeric stat to set.
  //
  //   • Anti-condition effects (Ring of Free Action, Ring of Feather
  //     Falling, Periapt of Wound Closure, Mantle of Spell Resistance)
  //     — needs a "condition immunity / save advantage" schema; lives
  //     adjacent to the condition system, not the bonus system.
  //
  //   • Curse/restriction items (Demon Armor, Vorpal Sword class
  //     restriction in flavor text) — RP-only.
  //
  // What v2.328 DID land structurally:
  //   • Belt of Giant Strength × 5 (Hill 21 / Stone 23 / Fire 25 /
  //     Cloud 27 / Storm 29) — all attuneable, all abilityOverride.
  //   • Holy Avenger / Luck Blade / Vorpal Sword — attackBonus +
  //     damageBonus filled in to match the descriptive text.
  //   • Stone of Good Luck — saveBonus: 1. Ability-check side stays
  //     narrative pending an ability-check-bonus schema field.
  // ───────────────────────────────────────────────────────────────────

  // Potions
  { id: 'potion-healing', name: 'Potion of Healing', type: 'potion', rarity: 'common', requiresAttunement: false, description: 'Drink to regain 2d4+2 HP.', weight: 0.5 },
  { id: 'potion-greater-healing', name: 'Potion of Greater Healing', type: 'potion', rarity: 'uncommon', requiresAttunement: false, description: 'Drink to regain 4d4+4 HP.', weight: 0.5 },
  { id: 'potion-superior-healing', name: 'Potion of Superior Healing', type: 'potion', rarity: 'rare', requiresAttunement: false, description: 'Drink to regain 8d4+8 HP.', weight: 0.5 },
  { id: 'potion-supreme-healing', name: 'Potion of Supreme Healing', type: 'potion', rarity: 'very rare', requiresAttunement: false, description: 'Drink to regain 10d4+20 HP.', weight: 0.5 },
  { id: 'potion-animal-friendship', name: 'Potion of Animal Friendship', type: 'potion', rarity: 'uncommon', requiresAttunement: false, description: 'For 1 hour, cast Animal Friendship at will (DC 13).', weight: 0.5 },
  { id: 'potion-climbing', name: 'Potion of Climbing', type: 'potion', rarity: 'common', requiresAttunement: false, description: 'For 1 hour, gain a climbing speed equal to your walking speed and advantage on Athletics checks to climb.', weight: 0.5 },
  { id: 'potion-diminution', name: 'Potion of Diminution', type: 'potion', rarity: 'rare', requiresAttunement: false, description: 'For 1d4 hours, you and everything you wear/carry become Tiny.', weight: 0.5 },
  { id: 'potion-flying', name: 'Potion of Flying', type: 'potion', rarity: 'very rare', requiresAttunement: false, description: 'For 1 hour, gain a flying speed equal to your walking speed and can hover.', weight: 0.5 },
  { id: 'potion-gaseous-form', name: 'Potion of Gaseous Form', type: 'potion', rarity: 'rare', requiresAttunement: false, description: 'For 1 hour, transform into a gaseous cloud. Immune to nonmagical damage, resistance to magical.', weight: 0.5 },
  { id: 'potion-giant-strength-hill', name: 'Potion of Hill Giant Strength', type: 'potion', rarity: 'uncommon', requiresAttunement: false, description: 'For 1 hour, STR becomes 21.', weight: 0.5 },
  { id: 'potion-giant-strength-stone', name: 'Potion of Stone Giant Strength', type: 'potion', rarity: 'rare', requiresAttunement: false, description: 'For 1 hour, STR becomes 23.', weight: 0.5 },
  { id: 'potion-giant-strength-fire', name: 'Potion of Fire Giant Strength', type: 'potion', rarity: 'rare', requiresAttunement: false, description: 'For 1 hour, STR becomes 25.', weight: 0.5 },
  { id: 'potion-giant-strength-cloud', name: 'Potion of Cloud Giant Strength', type: 'potion', rarity: 'very rare', requiresAttunement: false, description: 'For 1 hour, STR becomes 27.', weight: 0.5 },
  { id: 'potion-giant-strength-storm', name: 'Potion of Storm Giant Strength', type: 'potion', rarity: 'legendary', requiresAttunement: false, description: 'For 1 hour, STR becomes 29.', weight: 0.5 },
  { id: 'potion-invisibility', name: 'Potion of Invisibility', type: 'potion', rarity: 'very rare', requiresAttunement: false, description: 'For 1 hour or until you attack or cast a spell, you become invisible.', weight: 0.5 },
  { id: 'potion-mind-reading', name: 'Potion of Mind Reading', type: 'potion', rarity: 'rare', requiresAttunement: false, description: 'For 1 minute, cast Detect Thoughts (DC 13).', weight: 0.5 },
  { id: 'potion-poison', name: 'Potion of Poison', type: 'potion', rarity: 'uncommon', requiresAttunement: false, description: 'Cursed. Appears as a Healing Potion. DC 13 CON save or take 3d6 poison damage, poisoned for 24 hours.', weight: 0.5 },
  { id: 'potion-resistance', name: 'Potion of Resistance', type: 'potion', rarity: 'uncommon', requiresAttunement: false, description: 'For 1 hour, gain resistance to one damage type (acid, cold, fire, force, lightning, necrotic, poison, psychic, radiant, or thunder).', weight: 0.5 },
  { id: 'potion-speed', name: 'Potion of Speed', type: 'potion', rarity: 'very rare', requiresAttunement: false, description: 'For 1 minute, gain the effect of the Haste spell.', weight: 0.5 },
  { id: 'potion-water-breathing', name: 'Potion of Water Breathing', type: 'potion', rarity: 'uncommon', requiresAttunement: false, description: 'For 1 hour, breathe underwater.', weight: 0.5 },

  // Rings
  { id: 'ring-protection', name: 'Ring of Protection', type: 'ring', rarity: 'rare', requiresAttunement: true, description: '+1 bonus to AC and saving throws while attuned.', weight: 0, acBonus: 1, saveBonus: 1 },
  { id: 'ring-resistance', name: 'Ring of Resistance', type: 'ring', rarity: 'rare', requiresAttunement: true, description: 'Resistance to one damage type (determined by gem in setting).', weight: 0 },
  { id: 'ring-spell-storing', name: 'Ring of Spell Storing', type: 'ring', rarity: 'rare', requiresAttunement: true, description: 'Store up to 5 levels of spells. Any creature wearing it can cast stored spells.', weight: 0 },
  { id: 'ring-swimming', name: 'Ring of Swimming', type: 'ring', rarity: 'uncommon', requiresAttunement: false, description: 'Gain a swimming speed of 40 ft.', weight: 0 },
  { id: 'ring-warmth', name: 'Ring of Warmth', type: 'ring', rarity: 'uncommon', requiresAttunement: true, description: 'Resistance to cold damage. In cold environments, any creatures within 5 ft stay comfortably warm.', weight: 0 },
  { id: 'ring-feather-falling', name: 'Ring of Feather Falling', type: 'ring', rarity: 'rare', requiresAttunement: true, description: 'When you fall, you descend 60 ft per round and take no falling damage.', weight: 0 },
  { id: 'ring-free-action', name: 'Ring of Free Action', type: 'ring', rarity: 'rare', requiresAttunement: true, description: 'Ignores difficult terrain. Immune to paralysis and restrained conditions.', weight: 0 },
  { id: 'ring-regeneration', name: 'Ring of Regeneration', type: 'ring', rarity: 'very rare', requiresAttunement: true, description: 'Regain 1d6 HP every 10 minutes if you have at least 1 HP. Regrown severed body parts in 1d6+1 days.', weight: 0 },
  { id: 'ring-invisibility', name: 'Ring of Invisibility', type: 'ring', rarity: 'legendary', requiresAttunement: true, description: 'Become invisible at will as long as you wear it. Ends if you attack, cast a spell, or remove the ring.', weight: 0 },
  { id: 'ring-three-wishes', name: 'Ring of Three Wishes', type: 'ring', rarity: 'legendary', requiresAttunement: false, description: 'Cast Wish up to 3 times. When the third wish is made, the ring loses its magic.', weight: 0 },

  // Weapons — v2.181.0: baseDamageDice set to canonical SRD dice
  // for each item. Generic "Weapon, +N" intentionally omits dice;
  // pick a concrete weapon from the equipment catalogue instead.
  { id: 'sword-plus-1', name: 'Sword, +1', type: 'weapon', rarity: 'uncommon', requiresAttunement: false, description: '+1 bonus to attack and damage rolls made with this magic weapon.', weight: 3, baseDamageDice: '1d8 slashing' },
  { id: 'sword-plus-2', name: 'Sword, +2', type: 'weapon', rarity: 'rare', requiresAttunement: false, description: '+2 bonus to attack and damage rolls made with this magic weapon.', weight: 3, baseDamageDice: '1d8 slashing' },
  { id: 'sword-plus-3', name: 'Sword, +3', type: 'weapon', rarity: 'very rare', requiresAttunement: false, description: '+3 bonus to attack and damage rolls made with this magic weapon.', weight: 3, baseDamageDice: '1d8 slashing' },
  { id: 'weapon-plus-1', name: 'Weapon, +1', type: 'weapon', rarity: 'uncommon', requiresAttunement: false, description: '+1 bonus to attack and damage rolls made with this magic weapon.', weight: 2 },
  { id: 'weapon-plus-2', name: 'Weapon, +2', type: 'weapon', rarity: 'rare', requiresAttunement: false, description: '+2 bonus to attack and damage rolls made with this magic weapon.', weight: 2 },
  { id: 'weapon-plus-3', name: 'Weapon, +3', type: 'weapon', rarity: 'very rare', requiresAttunement: false, description: '+3 bonus to attack and damage rolls made with this magic weapon.', weight: 2 },
  { id: 'flame-tongue', name: 'Flame Tongue', type: 'weapon', rarity: 'rare', requiresAttunement: true, description: 'Command word ignites or extinguishes the blade. While lit: +2d6 fire damage, sheds bright light in 40 ft.', weight: 3, baseDamageDice: '1d8 slashing' },
  { id: 'frost-brand', name: 'Frost Brand', type: 'weapon', rarity: 'very rare', requiresAttunement: true, description: '+1d6 cold damage, resistance to fire. When drawn in freezing temps, shed bright light 10 ft. 1/hour extinguish nearby fires.', weight: 3, baseDamageDice: '1d8 slashing' },
  { id: 'dragon-slayer', name: 'Dragon Slayer', type: 'weapon', rarity: 'rare', requiresAttunement: false, description: '+1 attack/damage. Against dragons, +3d6 extra damage.', weight: 3, baseDamageDice: '1d8 slashing' },
  { id: 'giant-slayer', name: 'Giant Slayer', type: 'weapon', rarity: 'rare', requiresAttunement: false, description: '+1 attack/damage. Against giants, +2d6 extra damage and target must succeed DC 15 STR save or be knocked prone.', weight: 3, baseDamageDice: '1d8 slashing' },
  { id: 'holy-avenger', name: 'Holy Avenger', type: 'weapon', rarity: 'legendary', requiresAttunement: true, description: 'Paladin only. +3 to attack and damage. Radiant damage vs undead and fiends. Aura of protection (saves) within 10 ft.', weight: 3, baseDamageDice: '1d8 slashing', attackBonus: 3, damageBonus: 3 },
  { id: 'luck-blade', name: 'Luck Blade', type: 'weapon', rarity: 'legendary', requiresAttunement: true, description: '+1 attack/damage. 1 luck point to reroll. May have 1-3 Wish spells (DM determines).', weight: 3, baseDamageDice: '1d8 slashing', attackBonus: 1, damageBonus: 1 },
  { id: 'vorpal-sword', name: 'Vorpal Sword', type: 'weapon', rarity: 'legendary', requiresAttunement: true, description: '+3 attack/damage, slashing. Ignores resistance. On 20, decapitates if creature has neck.', weight: 3, baseDamageDice: '1d8 slashing', attackBonus: 3, damageBonus: 3 },
  { id: 'thundering-blade', name: 'Thundering Blade', type: 'weapon', rarity: 'uncommon', requiresAttunement: false, description: 'On hit, 1d6 thunder damage. On 20, target is deafened until start of its next turn.', weight: 2, baseDamageDice: '1d8 slashing' },

  // Armor
  { id: 'armor-plus-1', name: 'Armor, +1', type: 'armor', rarity: 'rare', requiresAttunement: false, description: '+1 bonus to AC. Applies on top of the armor\'s normal AC.', weight: 65 },
  { id: 'armor-plus-2', name: 'Armor, +2', type: 'armor', rarity: 'very rare', requiresAttunement: false, description: '+2 bonus to AC. Applies on top of the armor\'s normal AC.', weight: 65 },
  { id: 'armor-plus-3', name: 'Armor, +3', type: 'armor', rarity: 'legendary', requiresAttunement: false, description: '+3 bonus to AC. Applies on top of the armor\'s normal AC.', weight: 65 },
  { id: 'adamantine-armor', name: 'Adamantine Armor', type: 'armor', rarity: 'uncommon', requiresAttunement: false, description: 'Any critical hit against the wearer becomes a normal hit.', weight: 65 },
  { id: 'mithral-armor', name: 'Mithral Armor', type: 'armor', rarity: 'uncommon', requiresAttunement: false, description: 'No disadvantage on stealth checks. No Strength requirement.', weight: 45 },
  { id: 'demon-armor', name: 'Demon Armor', type: 'armor', rarity: 'very rare', requiresAttunement: true, description: 'AC 18 plate, claws deal +1d8 slashing. Curses wearer until Remove Curse is cast.', weight: 65 },
  { id: 'dragon-scale-mail', name: 'Dragon Scale Mail', type: 'armor', rarity: 'very rare', requiresAttunement: true, description: 'AC 14 + DEX (max 2). Resistance to the damage type of the dragon. Advantage on saves vs dragon breath.', weight: 45 },
  { id: 'elven-chain', name: 'Elven Chain', type: 'armor', rarity: 'rare', requiresAttunement: false, description: 'AC 14 + DEX (max 2). Proficiency not required. No disadvantage to stealth.', weight: 20 },
  { id: 'glamoured-studded-leather', name: 'Glamoured Studded Leather', type: 'armor', rarity: 'rare', requiresAttunement: false, description: 'AC 12 + DEX. Bonus action to alter appearance to any armor type or normal clothes.', weight: 13 },
  { id: 'plate-of-etherealness', name: 'Plate Armor of Etherealness', type: 'armor', rarity: 'legendary', requiresAttunement: true, description: 'While wearing, cast Etherealness (no spell slot required).', weight: 65 },

  // Wondrous Items
  { id: 'bag-of-holding', name: 'Bag of Holding', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: 'Holds up to 500 lb / 64 cubic feet. Weighs 15 lb regardless. Inside is an extradimensional space.', weight: 15 },
  // v2.328.0 — T5b: Belt of Giant Strength variants. Per RAW 2024 these
  // require attunement and override STR to a fixed value (Math.max with
  // base, so a barbarian whose raw STR is already higher gets no benefit).
  // Stone Giant strength is very rare in 2024 (rare in 2014); using the
  // 2024 rarity for consistency with the rest of the catalogue.
  { id: 'belt-of-hill-giant-strength', name: 'Belt of Hill Giant Strength', type: 'wondrous', rarity: 'rare', requiresAttunement: true, description: 'STR becomes 21 (no effect if already 21+).', weight: 1, abilityOverride: { ability: 'strength', value: 21 } },
  { id: 'belt-of-stone-giant-strength', name: 'Belt of Stone Giant Strength', type: 'wondrous', rarity: 'very rare', requiresAttunement: true, description: 'STR becomes 23 (no effect if already 23+).', weight: 1, abilityOverride: { ability: 'strength', value: 23 } },
  { id: 'belt-of-fire-giant-strength', name: 'Belt of Fire Giant Strength', type: 'wondrous', rarity: 'very rare', requiresAttunement: true, description: 'STR becomes 25 (no effect if already 25+).', weight: 1, abilityOverride: { ability: 'strength', value: 25 } },
  { id: 'belt-of-cloud-giant-strength', name: 'Belt of Cloud Giant Strength', type: 'wondrous', rarity: 'legendary', requiresAttunement: true, description: 'STR becomes 27 (no effect if already 27+).', weight: 1, abilityOverride: { ability: 'strength', value: 27 } },
  { id: 'belt-of-storm-giant-strength', name: 'Belt of Storm Giant Strength', type: 'wondrous', rarity: 'legendary', requiresAttunement: true, description: 'STR becomes 29 (no effect if already 29+).', weight: 1, abilityOverride: { ability: 'strength', value: 29 } },
  { id: 'boots-of-elvenkind', name: 'Boots of Elvenkind', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: 'Advantage on Stealth checks to move silently.', weight: 1 },
  { id: 'boots-of-speed', name: 'Boots of Speed', type: 'wondrous', rarity: 'rare', requiresAttunement: true, description: 'Bonus action: double your speed and opportunity attacks against you have disadvantage. Lasts 10 minutes (1 hr recharge).', weight: 1 },
  { id: 'boots-of-striding', name: 'Boots of Striding and Springing', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Speed 30 ft minimum. Jump distance tripled.', weight: 1 },
  { id: 'boots-of-flying', name: 'Winged Boots', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Fly at 30 ft speed. 4 hours max, charges recharge at dawn.', weight: 1 },
  { id: 'bracers-of-archery', name: 'Bracers of Archery', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: '+2 to damage rolls with longbows and shortbows.', weight: 1 },
  { id: 'bracers-of-defense', name: 'Bracers of Defense', type: 'wondrous', rarity: 'rare', requiresAttunement: true, description: '+2 AC while not wearing armor or using a shield.', weight: 1, acBonus: 2 },
  { id: 'cape-of-mountebank', name: 'Cape of the Mountebank', type: 'wondrous', rarity: 'rare', requiresAttunement: false, description: 'Cast Dimension Door as an action (regains at dawn).', weight: 1 },
  { id: 'cloak-of-displacement', name: 'Cloak of Displacement', type: 'wondrous', rarity: 'rare', requiresAttunement: true, description: 'Attackers have disadvantage on attack rolls against you. Stops if you take damage until start of next turn.', weight: 1 },
  { id: 'cloak-of-elvenkind', name: 'Cloak of Elvenkind', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Advantage on Stealth checks. Disadvantage on Perception checks to see you.', weight: 1 },
  { id: 'cloak-of-protection', name: 'Cloak of Protection', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: '+1 AC and +1 to saving throws.', weight: 1, acBonus: 1, saveBonus: 1 },
  { id: 'cloak-of-invisibility', name: 'Cloak of Invisibility', type: 'wondrous', rarity: 'legendary', requiresAttunement: true, description: 'Become invisible while wearing and hood is up. Seeing through requires True Sight. 2 hours per day.', weight: 1 },
  { id: 'crystal-ball', name: 'Crystal Ball', type: 'wondrous', rarity: 'very rare', requiresAttunement: true, description: 'Cast Scrying (DC 17) once per day.', weight: 5 },
  { id: 'dimensional-shackles', name: 'Dimensional Shackles', type: 'wondrous', rarity: 'rare', requiresAttunement: false, description: 'Restrain a creature. While restrained, it can\'t use teleportation or planar travel.', weight: 6 },
  { id: 'eyes-of-charming', name: 'Eyes of Charming', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Cast Charm Person (DC 13) up to 3 charges per day.', weight: 0 },
  { id: 'eyes-of-eagle', name: 'Eyes of the Eagle', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Advantage on Perception checks relying on sight. In clear conditions, see up to 1 mile without issue.', weight: 0 },
  { id: 'gauntlets-of-ogre-power', name: 'Gauntlets of Ogre Power', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'STR becomes 19 (no effect if already 19+).', weight: 2, abilityOverride: { ability: 'strength', value: 19 } },
  { id: 'gem-of-seeing', name: 'Gem of Seeing', type: 'wondrous', rarity: 'rare', requiresAttunement: true, description: 'True Sight 120 ft for 10 minutes. 3 charges, regains 1d3 daily.', weight: 0 },
  { id: 'gloves-of-swimming', name: 'Gloves of Swimming and Climbing', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Swim and climb speed equal to walking speed. Advantage on Athletics for swimming and climbing.', weight: 0 },
  { id: 'goggles-of-night', name: 'Goggles of Night', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: 'Darkvision 60 ft (stacks with existing).', weight: 0 },
  { id: 'hat-of-disguise', name: 'Hat of Disguise', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Cast Disguise Self at will.', weight: 0 },
  { id: 'headband-of-intellect', name: 'Headband of Intellect', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'INT becomes 19 (no effect if already 19+).', weight: 0, abilityOverride: { ability: 'intelligence', value: 19 } },
  { id: 'helm-of-brilliance', name: 'Helm of Brilliance', type: 'wondrous', rarity: 'very rare', requiresAttunement: true, description: 'Gemmed helm with daily spell uses: Daylight, Fireball, Prismatic Spray, Wall of Fire. Resistance to fire.', weight: 3 },
  { id: 'helm-of-comprehend', name: 'Helm of Comprehending Languages', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: 'Cast Comprehend Languages at will.', weight: 3 },
  { id: 'helm-of-teleportation', name: 'Helm of Teleportation', type: 'wondrous', rarity: 'rare', requiresAttunement: true, description: 'Cast Teleport 3 charges per day.', weight: 3 },
  { id: 'ioun-stone-sustenance', name: 'Ioun Stone (Sustenance)', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'No need to eat or drink.', weight: 0 },
  { id: 'lantern-of-revealing', name: 'Lantern of Revealing', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: '30 ft bright, 60 ft dim light. Invisible creatures in range become visible.', weight: 2 },
  { id: 'mantle-of-spell-resistance', name: 'Mantle of Spell Resistance', type: 'wondrous', rarity: 'rare', requiresAttunement: true, description: 'Advantage on saving throws against spells.', weight: 1 },
  { id: 'medallion-of-thoughts', name: 'Medallion of Thoughts', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Cast Detect Thoughts (DC 13) 3 charges/day.', weight: 0 },
  { id: 'necklace-of-fireballs', name: 'Necklace of Fireballs', type: 'wondrous', rarity: 'rare', requiresAttunement: false, description: '1-9 beads, each can be thrown to create a Fireball (DC 15, 5d6). Larger clusters scale up.', weight: 0 },
  { id: 'periapt-of-health', name: 'Periapt of Health', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: 'Immune to diseases.', weight: 0 },
  { id: 'periapt-of-proof-poison', name: 'Periapt of Proof Against Poison', type: 'wondrous', rarity: 'rare', requiresAttunement: false, description: 'Immune to poison damage and the poisoned condition.', weight: 0 },
  { id: 'periapt-of-wound-closure', name: 'Periapt of Wound Closure', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Stabilize at 0 HP automatically. Roll 2 dice and use higher result when spending Hit Dice.', weight: 0 },
  { id: 'pipes-of-haunting', name: 'Pipes of Haunting', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: '3 charges. Cast Fear (DC 13). Regains 1d3 charges at dawn.', weight: 2 },
  { id: 'rope-of-climbing', name: 'Rope of Climbing', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: 'Animated 60 ft rope. Commands to fasten, move, loop, or straighten.', weight: 3 },
  { id: 'sending-stones', name: 'Sending Stones', type: 'wondrous', rarity: 'uncommon', requiresAttunement: false, description: 'Pair of stones. Cast Sending to the other stone holder, once per day.', weight: 0 },
  { id: 'slippers-of-spider-climbing', name: 'Slippers of Spider Climbing', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: 'Climb on surfaces including ceilings at full speed, hands-free.', weight: 0.5 },
  { id: 'stone-of-controlling-earth', name: 'Stone of Controlling Earth Elementals', type: 'wondrous', rarity: 'rare', requiresAttunement: false, description: 'Once per day, summon an Earth Elemental (as if cast Conjure Elemental).', weight: 5 },
  { id: 'stone-of-good-luck', name: 'Stone of Good Luck (Luckstone)', type: 'wondrous', rarity: 'uncommon', requiresAttunement: true, description: '+1 to ability checks and saving throws.', weight: 0, saveBonus: 1 },
  { id: 'tome-of-clear-thought', name: 'Tome of Clear Thought', type: 'wondrous', rarity: 'very rare', requiresAttunement: false, description: 'Read in 48 hrs over 6 days: INT permanently increases by 2 (max 24). Then loses magic.', weight: 5 },
  { id: 'tome-of-leadership', name: 'Tome of Leadership and Influence', type: 'wondrous', rarity: 'very rare', requiresAttunement: false, description: 'Read in 48 hrs: CHA permanently increases by 2 (max 24). Then loses magic.', weight: 5 },
  { id: 'tome-of-understanding', name: 'Tome of Understanding', type: 'wondrous', rarity: 'very rare', requiresAttunement: false, description: 'Read in 48 hrs: WIS permanently increases by 2 (max 24). Then loses magic.', weight: 5 },
  { id: 'wand-of-fireballs', name: 'Wand of Fireballs', type: 'wand', rarity: 'rare', requiresAttunement: true, description: '7 charges. Expend 1-3 charges to cast Fireball (DC 15, base 8d6 + 1d6 per extra charge). Regains 1d6+1 at dawn.', weight: 1 },
  { id: 'wand-of-lightning', name: 'Wand of Lightning Bolts', type: 'wand', rarity: 'rare', requiresAttunement: true, description: '7 charges. Expend 1-3 charges to cast Lightning Bolt (DC 15, base 8d6 + 1d6 per extra charge). Regains 1d6+1 at dawn.', weight: 1 },
  { id: 'wand-of-magic-missiles', name: 'Wand of Magic Missiles', type: 'wand', rarity: 'uncommon', requiresAttunement: false, description: '7 charges. Expend 1-3 charges to cast Magic Missile (1 charge = 3 missiles, +1 missile per extra charge). Regains 1d6+1 at dawn.', weight: 1 },
  { id: 'wand-of-polymorph', name: 'Wand of Polymorph', type: 'wand', rarity: 'very rare', requiresAttunement: true, description: '7 charges. Cast Polymorph (DC 15). Regains 1d6+1 at dawn.', weight: 1 },
  { id: 'wand-of-secrets', name: 'Wand of Secrets', type: 'wand', rarity: 'uncommon', requiresAttunement: false, description: '3 charges. Detect secret doors and traps within 30 ft. Regains 1d3 at dawn.', weight: 1 },
  { id: 'staff-of-fire', name: 'Staff of Fire', type: 'staff', rarity: 'very rare', requiresAttunement: true, description: 'Druid/Sorcerer/Warlock/Wizard only. 10 charges: Burning Hands (1), Fireball (3), Wall of Fire (4). Regains 1d6+4 at dawn.', weight: 4, baseDamageDice: '1d6 bludgeoning' },
  { id: 'staff-of-healing', name: 'Staff of Healing', type: 'staff', rarity: 'rare', requiresAttunement: true, description: 'Bard/Cleric/Druid only. 10 charges: Cure Wounds (1+/slot level), Lesser Restoration (2), Mass Cure Wounds (5). Regains 1d6+4 at dawn.', weight: 4, baseDamageDice: '1d6 bludgeoning' },
  { id: 'staff-of-power', name: 'Staff of Power', type: 'staff', rarity: 'very rare', requiresAttunement: true, description: 'Sorcerer/Warlock/Wizard only. +2 AC, attack, saves. 20 charges, many spells. Retributive Strike.', weight: 4, baseDamageDice: '1d6 bludgeoning' },
  { id: 'staff-of-swarming-insects', name: 'Staff of Swarming Insects', type: 'staff', rarity: 'rare', requiresAttunement: true, description: 'Bard/Cleric/Druid/Shaman/Warlock/Wizard only. 10 charges. Fly Plague, Giant Insect, Insect Plague.', weight: 4, baseDamageDice: '1d6 bludgeoning' },
  { id: 'staff-of-thunder-lightning', name: 'Staff of Thunder and Lightning', type: 'staff', rarity: 'very rare', requiresAttunement: true, description: '+2 attack/damage. Lightning (2d6), Thunder (2d6+knockback), Lightning Strike, Thunderclap, Thunder and Lightning. All recharge at dawn.', weight: 4, baseDamageDice: '1d6 bludgeoning' },

  // Rods
  { id: 'rod-of-absorption', name: 'Rod of Absorption', type: 'rod', rarity: 'very rare', requiresAttunement: true, description: 'Reaction: absorb a spell targeting only you. Stores spell levels to cast from later.', weight: 2 },
  { id: 'rod-of-lordly-might', name: 'Rod of Lordly Might', type: 'rod', rarity: 'legendary', requiresAttunement: true, description: 'Functions as a +3 mace. Six button-activated effects: Flame, Drain Life, Paralysis, Climb (spikes), Fear, and Battlement (bridge).', weight: 5 },
  { id: 'rod-of-rulership', name: 'Rod of Rulership', type: 'rod', rarity: 'rare', requiresAttunement: true, description: 'Once per day: Dominate all creatures within 120 ft with 200 HP or fewer (DC 15 WIS save). Lasts 8 hours.', weight: 2 },
  { id: 'rod-of-the-pact-keeper-1', name: 'Rod of the Pact Keeper (+1)', type: 'rod', rarity: 'uncommon', requiresAttunement: true, description: 'Warlock only. +1 to spell attacks and save DCs. Regain one Pact Magic spell slot per long rest.', weight: 2 },
];

export const MAGIC_ITEM_MAP: Record<string, MagicItem> = Object.fromEntries(MAGIC_ITEMS.map(m => [m.id, m]));

export const RARITY_ORDER: MagicItemRarity[] = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];

export const RARITY_COLORS: Record<MagicItemRarity, string> = {
  common:    '#c4c4c4',
  uncommon:  '#1eff00',
  rare:      '#0070dd',
  'very rare': '#a335ee',
  legendary: '#ff8000',
  artifact:  '#e6cc80',
};
