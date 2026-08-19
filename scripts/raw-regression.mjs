// v2.565.0 — RAW regression suite (Track 1).
// Encodes RAW values corrected during the 2024 audit as assertions so
// regressions fail loudly. DETECTION ONLY — this script never edits data.
// Runs via `npm run raw-check`, in CI on every push, and on a daily cron.
//
// Uses esbuild (already present as a vite dependency) to bundle the TS
// data modules, then imports and asserts. No test framework needed.

import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const tmp = mkdtempSync(join(tmpdir(), 'raw-regression-'));
const entry = join(tmp, 'entry.ts');
const out = join(tmp, 'bundle.mjs');

writeFileSync(entry, `
export { SPELLS } from '${process.cwd().replace(/\\/g, '/')}/src/data/spells';
export { CLASS_COMBAT_ABILITIES } from '${process.cwd().replace(/\\/g, '/')}/src/data/classAbilities';
export { CLASS_MAP } from '${process.cwd().replace(/\\/g, '/')}/src/data/classes';
export { FEATS } from '${process.cwd().replace(/\\/g, '/')}/src/data/feats';
export { getCharacterResources } from '${process.cwd().replace(/\\/g, '/')}/src/data/classResources';
export { MASTERY_WEAPONS, masterySlots, masteryForWeapon, eligibleMasteryWeapons, weaponReachFt, isMeleeMasteryWeapon } from '${process.cwd().replace(/\\/g, '/')}/src/data/weaponMastery';
export { stripAbilityModFromDamage, CLEAVE_ONCE_KEY } from '${process.cwd().replace(/\\/g, '/')}/src/lib/cleave';
export { footprintAt, gapCells, isInsideEmanation, spiritGuardiansSpec, auraSaveMarkerKey, AURA_SPELLS, buildAuraKeyForSpell } from '${process.cwd().replace(/\\/g, '/')}/src/lib/auras';
`);

buildSync({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'silent',
  // A data module transitively reaches lib/supabase which reads
  // import.meta.env at module scope — stub it for the node runtime.
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '"http://localhost"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"raw-regression-stub"',
    'import.meta.env': '{}',
  },
});

const { SPELLS, CLASS_COMBAT_ABILITIES, CLASS_MAP, FEATS, getCharacterResources, MASTERY_WEAPONS, masterySlots, masteryForWeapon, eligibleMasteryWeapons, weaponReachFt, isMeleeMasteryWeapon, stripAbilityModFromDamage, CLEAVE_ONCE_KEY, footprintAt, gapCells, isInsideEmanation, spiritGuardiansSpec, auraSaveMarkerKey, AURA_SPELLS, buildAuraKeyForSpell } = await import(pathToFileURL(out).href);

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ok  ${name}`); }
  else { failures++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
const spell = (id) => SPELLS.find((s) => s.id === id);
const featByName = (n) => FEATS.find((f) => f.name === n);

console.log('— Spells: structural —');
{
  const ids = SPELLS.map((s) => s.id);
  const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);
  check('no duplicate spell ids', dupIds.length === 0, dupIds.join(','));
  const names = SPELLS.map((s) => s.name);
  const dupNames = names.filter((v, i) => names.indexOf(v) !== i);
  check('no duplicate spell names', dupNames.length === 0, dupNames.join(','));
}

console.log('— Spells: v2.547–v2.548 fixes —');
{
  const sw = spell('spiritual-weapon');
  check('Spiritual Weapon is concentration', sw?.concentration === true);
  check('Spiritual Weapon duration says Concentration', /concentration/i.test(sw?.duration ?? ''));
  const hm = spell('hunters-mark');
  check("Hunter's Mark deals Force", /force/i.test((hm?.description ?? '') + (hm?.damage_type ?? '')));
  check('Summon Dragon is Wizard-only', JSON.stringify(spell('summon-dragon')?.classes) === '["Wizard"]');
  const pwh = spell('power-word-heal');
  check('Power Word Heal classes Bard+Cleric only', JSON.stringify((pwh?.classes ?? []).slice().sort()) === '["Bard","Cleric"]');
  check("Drawmij's Instant Summons named with prefix", !!SPELLS.find((s) => s.name === "Drawmij's Instant Summons"));
}

console.log('— Spells: 2024 additions (v2.555–v2.562) —');
for (const id of ['divine-smite','elementalism','sorcerous-burst','starry-wisp','arcane-vigor','shining-smite','fount-of-moonlight','jallarzis-storm-of-radiance','tashas-bubbling-cauldron','yolandes-regal-presence','power-word-fortify','thunderclap','thorn-whip','dragons-breath','elemental-weapon','circle-of-power']) {
  check(`spell exists: ${id}`, !!spell(id));
}
{
  const ds = spell('divine-smite');
  check('Divine Smite: L1 Paladin, Instantaneous', ds?.level === 1 && JSON.stringify(ds?.classes) === '["Paladin"]' && ds?.duration === 'Instantaneous');
}

console.log('— Spells: Psion hygiene (v2.559) —');
for (const id of ['bleeding-darkness','ectoplasmic-trail','life-inversion-field','psionic-blast','summon-astral-entity','telekinetic-crush']) {
  const sp = SPELLS.find((s) => s.id === id) ?? SPELLS.find((s) => s.name?.toLowerCase().replace(/[^a-z]+/g, '-') === id);
  check(`UA spell Psion-only: ${id}`, !sp || JSON.stringify(sp.classes) === '["Psion"]', JSON.stringify(sp?.classes));
}

console.log('— Spells: Artificer backfill (v2.560) —');
{
  const count = SPELLS.filter((s) => (s.classes ?? []).includes('Artificer')).length;
  check(`Artificer on >= 70 spell lists (now ${count})`, count >= 70);
  check('Intellect Fortress NOT Artificer (FotA)', !(spell('intellect-fortress')?.classes ?? []).includes('Artificer'));
}

console.log('— Class abilities: scaling (v2.551) —');
{
  const cleric = (CLASS_COMBAT_ABILITIES['Cleric'] ?? []).find((a) => a.name === 'Channel Divinity');
  check('Cleric CD: 3 uses at L17', cleric?.maxUsesFn?.({ level: 17 }) === 3);
  check('Cleric CD: 4 uses at L18 (not 11)', cleric?.maxUsesFn?.({ level: 18 }) === 4 && cleric?.maxUsesFn?.({ level: 11 }) === 3);
  const pala = (CLASS_COMBAT_ABILITIES['Paladin'] ?? []).find((a) => a.name === 'Channel Divinity');
  check('Paladin CD: 2 at L3, 2 at L7, 3 at L11', pala?.maxUsesFn?.({ level: 3 }) === 2 && pala?.maxUsesFn?.({ level: 7 }) === 2 && pala?.maxUsesFn?.({ level: 11 }) === 3);
  const ws = (CLASS_COMBAT_ABILITIES['Druid'] ?? []).find((a) => a.name === 'Wild Shape');
  check('Wild Shape uses: 2/3/4 at 2/6/17', ws?.maxUsesFn?.({ level: 2 }) === 2 && ws?.maxUsesFn?.({ level: 6 }) === 3 && ws?.maxUsesFn?.({ level: 17 }) === 4);
}

console.log('— Class abilities: save DCs (v2.554) —');
{
  const monk = (CLASS_COMBAT_ABILITIES['Monk'] ?? []).find((a) => a.name === 'Stunning Strike');
  check('Stunning Strike DC = classAbility WIS', monk?.save?.dc?.classAbility === 'WIS');
  const rogue = (CLASS_COMBAT_ABILITIES['Rogue'] ?? []).find((a) => a.name === 'Cunning Strike');
  check('Cunning Strike DC = classAbility DEX', rogue?.save?.dc?.classAbility === 'DEX');
}

console.log('— Subclasses: Berserker (v2.550/v2.554) —');
{
  const barb = CLASS_MAP['Barbarian'];
  const berserker = (barb?.subclasses ?? []).find((s) => /berserker/i.test(s.name));
  const feats = berserker?.features ?? [];
  const frenzy = feats.find((f) => f.name === 'Frenzy');
  check('Frenzy is 2024 (Reckless Attack rider)', /Reckless Attack/.test(frenzy?.description ?? ''));
  const mindless = feats.find((f) => f.name === 'Mindless Rage');
  check('Mindless Rage grants Immunity', /Immunity/.test(mindless?.description ?? ''));
  const ip = feats.find((f) => f.name === 'Intimidating Presence');
  check('Intimidating Presence: STR class DC + Emanation', ip?.save?.dc?.classAbility === 'STR' && /Emanation/.test(ip?.description ?? ''));
}

console.log('— Feats (v2.553) —');
{
  const alert = featByName('Alert');
  check('Alert: 2024 (Initiative Proficiency, no +5)', (alert?.benefits ?? []).some((b) => /Initiative Proficiency/.test(b)) && !(alert?.benefits ?? []).some((b) => /\+5/.test(b)));
  const lucky = featByName('Lucky');
  check('Lucky: Luck Points = PB', (lucky?.benefits ?? []).some((b) => /Proficiency Bonus/.test(b)));
  const tb = featByName('Tavern Brawler');
  check('Tavern Brawler: no fabricated Reaction benefit', !(tb?.benefits ?? []).some((b) => /Reaction/.test(b)));
  const skilled = featByName('Skilled');
  check('Skilled: skills or tools + Repeatable', (skilled?.benefits ?? []).some((b) => /skills or tools/i.test(b)) && (skilled?.benefits ?? []).some((b) => /Repeatable/i.test(b)));

  // v2.672.0 — Feat names are the identity everywhere: gained_feats stores
  // names, featRiders switches on them, and every picker keys its React
  // list by feat.name. A duplicate name silently shadows one entry in
  // FEATS.find() AND collides as a React key (dropped/duplicated card).
  // Caught by a real 'Tough' duplicate (origin + a 2014-era general copy).
  {
    const seen = new Set();
    const dupes = FEATS.map((f) => f.name).filter((n) => seen.size === seen.add(n).size);
    check(`Feat names are unique${dupes.length ? ` (dupes: ${[...new Set(dupes)].join(', ')})` : ''}`, dupes.length === 0);
  }

  // 2024 PHB: Tough is an ORIGIN feat, taken at level 1 via Background —
  // not a level-4 General feat as in 2014.
  const tough = featByName('Tough');
  check('Tough is an Origin feat with no prerequisite', tough?.category === 'origin' && !tough?.prerequisite);
}

rmSync(tmp, { recursive: true, force: true });

console.log('— Weapon Mastery: v2.629 data layer (SRD 5.2.1) —');
{
  check('38 mastery weapons in SRD table', MASTERY_WEAPONS.length === 38);
  check('Greataxe = Cleave', masteryForWeapon('Greataxe') === 'Cleave');
  check('Longbow = Slow', masteryForWeapon('Longbow') === 'Slow');
  check('Rapier = Vex', masteryForWeapon('Rapier') === 'Vex');
  check('Maul = Topple', masteryForWeapon('Maul') === 'Topple');
  check('inventory-style name resolves (Longsword +1 = Sap)', masteryForWeapon('Longsword +1') === 'Sap');
  check('Fighter slots 3/4/5/6 at 1/4/10/16',
    masterySlots('Fighter', 1) === 3 && masterySlots('Fighter', 4) === 4 &&
    masterySlots('Fighter', 10) === 5 && masterySlots('Fighter', 16) === 6);
  check('Barbarian slots 2/3/4 at 1/4/10',
    masterySlots('Barbarian', 1) === 2 && masterySlots('Barbarian', 4) === 3 &&
    masterySlots('Barbarian', 10) === 4);
  check('Paladin/Ranger/Rogue fixed at 2; Wizard 0',
    masterySlots('Paladin', 20) === 2 && masterySlots('Ranger', 20) === 2 &&
    masterySlots('Rogue', 20) === 2 && masterySlots('Wizard', 20) === 0);
  check('Barbarian eligibility is melee-only',
    eligibleMasteryWeapons('Barbarian').every((w) => w.group === 'simple_melee' || w.group === 'martial_melee'));
  check('Rogue eligibility excludes Longbow, includes Rapier',
    !eligibleMasteryWeapons('Rogue').some((w) => w.name === 'Longbow') &&
    eligibleMasteryWeapons('Rogue').some((w) => w.name === 'Rapier'));
}

console.log('— Weapon Mastery: v2.633 Cleave (SRD 5.2.1) —');
{
  // Only two SRD weapons carry Cleave.
  const cleaveWeapons = MASTERY_WEAPONS.filter((w) => w.mastery === 'Cleave').map((w) => w.name).sort();
  check('Cleave weapons are exactly Greataxe + Halberd',
    JSON.stringify(cleaveWeapons) === JSON.stringify(['Greataxe', 'Halberd']));
  // Reach property (SRD 5.2.1): Glaive, Halberd, Lance, Pike, Whip.
  const reachWeapons = MASTERY_WEAPONS.filter((w) => w.reach).map((w) => w.name).sort();
  check('Reach weapons are exactly Glaive/Halberd/Lance/Pike/Whip',
    JSON.stringify(reachWeapons) === JSON.stringify(['Glaive', 'Halberd', 'Lance', 'Pike', 'Whip']));
  check('Halberd reach is 10 ft, Greataxe is 5 ft',
    weaponReachFt('Halberd') === 10 && weaponReachFt('Greataxe') === 5);
  check('Reach resolves through magic-weapon name suffixes',
    weaponReachFt('Halberd +1') === 10 && weaponReachFt('Greataxe (silvered)') === 5);
  check('Ranged weapons have no melee reach; unknown names return null',
    weaponReachFt('Longbow') === null && weaponReachFt('Bagpipes') === null);
  check('isMeleeMasteryWeapon separates melee from ranged',
    isMeleeMasteryWeapon('Greataxe') && isMeleeMasteryWeapon('Dagger') &&
    !isMeleeMasteryWeapon('Longbow') && !isMeleeMasteryWeapon('Hand Crossbow'));
  // "don't add your ability modifier to that damage unless that
  // modifier is negative" — and only the ABILITY mod comes out, so a
  // magic weapon's bonus survives.
  check('Cleave strips a positive ability modifier',
    stripAbilityModFromDamage('1d12+4', 4) === '1d12');
  check('Cleave keeps a magic bonus after stripping the ability mod',
    stripAbilityModFromDamage('1d10+5', 4) === '1d10+1');
  check('Cleave keeps a NEGATIVE ability modifier (RAW exception)',
    stripAbilityModFromDamage('1d12-1', -1) === '1d12-1');
  check('Cleave with a zero modifier is a no-op',
    stripAbilityModFromDamage('1d12+4', 0) === '1d12+4');
  check('Cleave leaves unparseable damage untouched',
    stripAbilityModFromDamage('2d6+1d4+3', 3) === '2d6+1d4+3');
  check('Cleave once-per-turn marker key is stable',
    CLEAVE_ONCE_KEY === 'weapon_mastery_cleave');
}

console.log('— Auras: v2.634 Emanation geometry + Spirit Guardians (2024) —');
{
  // Footprint parity convention: odd sizes anchor on the centre cell,
  // even sizes on the top-left cell. Must match battleMapGeometry.
  const med = footprintAt(5, 5, 1);
  check('Size 1 footprint is the anchor cell',
    med.rMin === 5 && med.rMax === 5 && med.cMin === 5 && med.cMax === 5);
  const huge = footprintAt(5, 5, 3);
  check('Odd size 3 centres on the anchor',
    huge.rMin === 4 && huge.rMax === 6 && huge.cMin === 4 && huge.cMax === 6);
  const large = footprintAt(5, 5, 2);
  check('Even size 2 extends right/down from the anchor',
    large.rMin === 5 && large.rMax === 6 && large.cMin === 5 && large.cMax === 6);

  // Chebyshev gap in CELLS APART: the next square over is 1 (= 5 ft),
  // and a diagonal counts as a single square per RAW 2024. Matches
  // battleMapGeometry.distanceBetweenTokensFt, which multiplies by 5.
  check('Adjacent cells are 1 apart (5 ft)',
    gapCells(footprintAt(5, 5, 1), footprintAt(5, 6, 1)) === 1);
  check('Diagonals count as a single square',
    gapCells(footprintAt(5, 5, 1), footprintAt(6, 6, 1)) === 1);
  check('Gap scales linearly with separation',
    gapCells(footprintAt(5, 5, 1), footprintAt(5, 9, 1)) === 4);

  // A 15-ft Emanation reaches 3 squares out from the origin's space.
  const origin = footprintAt(5, 5, 1);
  check('15-ft Emanation includes a creature 3 squares out',
    isInsideEmanation(origin, footprintAt(5, 8, 1), 15));
  check('15-ft Emanation excludes a creature 4 squares out',
    !isInsideEmanation(origin, footprintAt(5, 9, 1), 15));
  // Large origins project from their whole footprint, not their anchor.
  check('Large origin projects from its footprint edge, not its anchor',
    isInsideEmanation(footprintAt(5, 5, 2), footprintAt(5, 9, 1), 15) &&
    !isInsideEmanation(footprintAt(5, 5, 1), footprintAt(5, 9, 1), 15));
  // Paladin Aura of Protection is a 10-ft Emanation = 2 squares.
  check('10-ft Emanation reaches exactly 2 squares',
    isInsideEmanation(origin, footprintAt(5, 7, 1), 10) &&
    !isInsideEmanation(origin, footprintAt(5, 8, 1), 10));

  // Spirit Guardians 2024: 15-ft Emanation, WIS save, 3d8 at level 3
  // scaling +1d8 per slot above 3rd, half on save, Speed halved,
  // triggers on enter / emanation-sweep / END of turn (NOT start).
  const sg = spiritGuardiansSpec({ saveDC: 15, slotLevel: 3, damageType: 'radiant' });
  check('Spirit Guardians is a 15-ft WIS Emanation', sg.radiusFt === 15 && sg.saveAbility === 'WIS');
  check('Spirit Guardians deals 3d8 at level 3', sg.damageDice === '3d8');
  check('Spirit Guardians upcasts +1d8 per slot level',
    spiritGuardiansSpec({ saveDC: 15, slotLevel: 5, damageType: 'radiant' }).damageDice === '5d8' &&
    spiritGuardiansSpec({ saveDC: 15, slotLevel: 9, damageType: 'radiant' }).damageDice === '9d8');
  check('Spirit Guardians deals half on a successful save', sg.halfOnSave === true);
  check('Spirit Guardians halves Speed inside the area', sg.speedInside === 'half');
  check('Spirit Guardians triggers on ENTER and END of turn (2024, not start)',
    sg.triggers.includes('creature_entered') && sg.triggers.includes('turn_end') &&
    sg.triggers.includes('emanation_entered'));
  check('Spirit Guardians affects all non-designated creatures',
    sg.affects === 'all' && sg.exemptParticipantIds.length === 0);
  check('Aura save markers are scoped per origin AND per aura',
    auraSaveMarkerKey('origin-a', 'spirit_guardians') !== auraSaveMarkerKey('origin-b', 'spirit_guardians'));

  // v2.635 cast wiring: every registry entry must key off a real
  // spells.ts id, and the teardown path derives the AuraSpec key from
  // that id without rebuilding the spec — the two must agree or an
  // aura would be impossible to remove.
  for (const [spellId, entry] of Object.entries(AURA_SPELLS)) {
    check(`Aura spell '${spellId}' exists in the spell catalogue`,
      SPELLS.some((sp) => sp.id === spellId));
    const built = entry.build({
      saveDC: 15, slotLevel: 3, damageType: entry.damageTypeChoices[0] ?? '', exemptParticipantIds: [],
    });
    check(`Aura spell '${spellId}' teardown key matches its spec key`,
      buildAuraKeyForSpell(spellId) === built.key);
  }
  check('Spirit Guardians offers the RAW alignment damage choice',
    JSON.stringify(AURA_SPELLS['spirit-guardians'].damageTypeChoices) ===
      JSON.stringify(['radiant', 'necrotic']));
  check('Spirit Guardians allows cast-time designation',
    AURA_SPELLS['spirit-guardians'].allowsDesignation === true);
  check('Designated creatures are carried into the spec',
    AURA_SPELLS['spirit-guardians'].build({
      saveDC: 15, slotLevel: 3, damageType: 'radiant', exemptParticipantIds: ['p1', 'p2'],
    }).exemptParticipantIds.length === 2);
}

console.log('— Class resources: v2.623 Font of Inspiration gate —');
{
  const scores = { charisma: 16 };
  const bardic = (lvl) => getCharacterResources('Bard', lvl, scores).find((r) => r.id === 'bardic-inspiration');
  check('Bardic Inspiration L4 recovers on Long Rest', bardic(4)?.recovery === 'long');
  check('Bardic Inspiration L5+ recovers on Short Rest (Font of Inspiration)', bardic(5)?.recovery === 'short');
}

console.log('— Class core traits: 2024 stat block (v2.677) —');
{
  // The "Core <Class> Traits" table each class opens with. Verified against
  // SRD 5.2 (CC-BY, the 2024 rules) on 2026-08-19, when eight of these were
  // still carrying 2014 values — nothing in this suite had ever looked at
  // the class stat block, so the drift was silent. Assert only the fields
  // that table fixes; subclass features are a separate problem.
  //
  // Deliberately spelled out per class rather than looped over a fixture:
  // a fixture would just be the same data twice, and would agree with
  // classes.ts even when both are wrong.
  const trait = (name) => {
    const c = CLASS_MAP[name];
    check(`${name} exists in CLASS_MAP`, !!c);
    return c ?? {};
  };
  const eq = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected));

  // Hit die and saving throws — every class, since they drive real maths.
  const HIT_DIE = { Barbarian: 12, Bard: 8, Cleric: 8, Druid: 8, Fighter: 10, Monk: 8,
                    Paladin: 10, Ranger: 10, Rogue: 8, Sorcerer: 6, Warlock: 8, Wizard: 6 };
  const SAVES = {
    Barbarian: ['strength', 'constitution'], Bard: ['dexterity', 'charisma'],
    Cleric: ['wisdom', 'charisma'],          Druid: ['intelligence', 'wisdom'],
    Fighter: ['strength', 'constitution'],   Monk: ['strength', 'dexterity'],
    Paladin: ['wisdom', 'charisma'],         Ranger: ['strength', 'dexterity'],
    Rogue: ['dexterity', 'intelligence'],    Sorcerer: ['constitution', 'charisma'],
    Warlock: ['wisdom', 'charisma'],         Wizard: ['intelligence', 'wisdom'],
  };
  const SKILL_COUNT = { Barbarian: 2, Bard: 3, Cleric: 2, Druid: 2, Fighter: 2, Monk: 2,
                        Paladin: 2, Ranger: 3, Rogue: 4, Sorcerer: 2, Warlock: 2, Wizard: 2 };
  for (const [name, die] of Object.entries(HIT_DIE)) {
    check(`${name} hit die is d${die}`, trait(name).hit_die === die);
    eq(`${name} saving throws`, trait(name).saving_throw_proficiencies, SAVES[name]);
    check(`${name} chooses ${SKILL_COUNT[name]} skills`, trait(name).skill_count === SKILL_COUNT[name]);
  }

  // The eight the 2026-08-19 audit corrected. Each of these was wrong once,
  // so each gets its own named assertion rather than a table row.
  check('Barbarian Primary Ability is Strength alone (not Str + Con)',
    JSON.stringify(trait('Barbarian').primary_abilities) === JSON.stringify(['strength']));
  eq('Bard weapons are Simple only (2024 dropped rapier/longsword/etc.)',
    trait('Bard').weapon_proficiencies, ['Simple Weapons']);
  eq('Sorcerer weapons are Simple only', trait('Sorcerer').weapon_proficiencies, ['Simple Weapons']);
  eq('Wizard weapons are Simple only', trait('Wizard').weapon_proficiencies, ['Simple Weapons']);
  eq('Rogue weapons are Simple + Martial with Finesse or Light',
    trait('Rogue').weapon_proficiencies,
    ['Simple Weapons', 'Martial Weapons with the Finesse or Light property']);
  // Medium armour reaches the Druid through the Warden Primal Order choice
  // at level 1, NOT the class table — listing it here granted it twice. The
  // 2014 "no metal" restriction is gone from the 2024 rules entirely.
  eq('Druid armour is Light + Shields (Warden grants Medium separately)',
    trait('Druid').armor_proficiencies, ['Light Armor', 'Shields']);
  check('Fighter skill list includes Persuasion',
    trait('Fighter').skill_choices.includes('Persuasion'));
  check('Wizard skill list includes Nature',
    trait('Wizard').skill_choices.includes('Nature'));

  // Guard the shape of the two lists that changed, so a future edit can't
  // quietly re-add a 2014 entry alongside the corrected one.
  check('Fighter offers exactly 9 skill options', trait('Fighter').skill_choices.length === 9);
  check('Wizard offers exactly 7 skill options', trait('Wizard').skill_choices.length === 7);
}

console.log(failures === 0 ? `\nRAW regression: ALL CHECKS PASSED` : `\nRAW regression: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
