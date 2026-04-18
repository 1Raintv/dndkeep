// Generate SQL INSERT statements for the unified spells table from src/data/spells.ts
// Usage: node scripts/generate-spell-seed.mjs > spell_seed.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Use tsx (already in devDeps via vite) to import the TS file as ESM
// Approach: transpile spells.ts to a temp .mjs file via esbuild (vite's bundler)
import { build } from 'esbuild';

await build({
  entryPoints: ['src/data/spells.ts'],
  bundle: false,
  format: 'esm',
  outfile: '/tmp/_spells_compiled.mjs',
  platform: 'node',
  target: 'node20',
  loader: { '.ts': 'ts' },
  // Strip the type-only import
  banner: { js: '// auto-generated from spells.ts' },
});

// Replace the type import with a stub so node can run it
const compiled = readFileSync('/tmp/_spells_compiled.mjs', 'utf8');
writeFileSync('/tmp/_spells_compiled.mjs', compiled);

const { SPELLS } = await import('/tmp/_spells_compiled.mjs');

console.error(`Loaded ${SPELLS.length} spells from spells.ts`);

// Heuristic: spells named with UA/Tasha/Fizban + the brand-new UA Psion spells get source='ua'
// Everything else is SRD/PHB canonical
const UA_SPELL_IDS = new Set([
  // UA Psion 2025 brand-new spells
  'telekinetic-fling', 'telekinetic-crush', 'psionic-blast', 'thought-form',
  'ego-whip', 'life-siphon', 'bleeding-darkness', 'ectoplasmic-trail',
  'life-inversion-field', 'summon-astral-entity',
  // XGE/Tasha's/Fizban's that returned in UA Psion update
  'intellect-fortress', 'raulothims-psychic-lance', 'tashas-mind-whip',
  'psychic-scream',
]);

function classifySource(spell) {
  if (UA_SPELL_IDS.has(spell.id)) return 'ua';
  return 'srd';
}

// Postgres-safe quoting
function pq(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  // String — escape single quotes by doubling
  return `'${String(v).replace(/'/g, "''")}'`;
}

function pqArray(arr) {
  if (!arr || !Array.isArray(arr)) return "'{}'";
  // Postgres text array: '{"item1","item2"}'
  const inner = arr.map(s => `"${String(s).replace(/"/g, '\\"').replace(/'/g, "''")}"`).join(',');
  return `'{${inner}}'`;
}

function pqJsonb(obj) {
  if (!obj) return 'NULL';
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

const cols = [
  'id', 'name', 'owner_id', 'source', 'visibility',
  'level', 'school', 'casting_time', '"range"', 'components', 'duration',
  'concentration', 'ritual', 'classes', 'description', 'higher_levels',
  'save_type', 'attack_type', 'damage_dice', 'damage_type',
  'damage_at_slot_level', 'damage_at_char_level',
  'heal_dice', 'heal_at_slot_level', 'area_of_effect',
];

const lines = [`INSERT INTO public.spells (${cols.join(', ')}) VALUES`];
const valueRows = SPELLS.map(s => {
  const source = classifySource(s);
  return '(' + [
    pq(s.id),
    pq(s.name),
    'NULL',                    // owner_id (canonical)
    pq(source),
    "'private'",               // visibility (irrelevant for canonical, default)
    pq(s.level),
    pq(s.school),
    pq(s.casting_time ?? '1 action'),
    pq(s.range ?? 'Self'),
    pq(s.components ?? 'V, S'),
    pq(s.duration ?? 'Instantaneous'),
    pq(!!s.concentration),
    pq(!!s.ritual),
    pqArray(s.classes),
    pq(s.description ?? ''),
    pq(s.higher_levels),
    pq(s.save_type),
    pq(s.attack_type),
    pq(s.damage_dice),
    pq(s.damage_type),
    pqJsonb(s.damage_at_slot_level),
    pqJsonb(s.damage_at_char_level),
    pq(s.heal_dice),
    pqJsonb(s.heal_at_slot_level),
    pqJsonb(s.area_of_effect),
  ].join(', ') + ')';
});

const finalSql = lines.concat([valueRows.join(',\n'), 'ON CONFLICT (id) DO NOTHING;']).join('\n');

console.log(finalSql);
console.error(`Generated SQL: ${finalSql.length} chars, ${SPELLS.length} rows`);
console.error(`UA-tagged: ${SPELLS.filter(s => classifySource(s) === 'ua').length}`);
console.error(`SRD-tagged: ${SPELLS.filter(s => classifySource(s) === 'srd').length}`);
