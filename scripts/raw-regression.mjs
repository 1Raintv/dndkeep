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

const { SPELLS, CLASS_COMBAT_ABILITIES, CLASS_MAP, FEATS } = await import(pathToFileURL(out).href);

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
}

rmSync(tmp, { recursive: true, force: true });

console.log(failures === 0 ? `\nRAW regression: ALL CHECKS PASSED` : `\nRAW regression: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
