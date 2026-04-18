// Split spells into smaller chunks for cleaner migration history
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/data/spells.ts'],
  bundle: false,
  format: 'esm',
  outfile: '/tmp/_spells_compiled.mjs',
  platform: 'node',
  target: 'node20',
  loader: { '.ts': 'ts' },
});

const { SPELLS } = await import('/tmp/_spells_compiled.mjs');

const UA_SPELL_IDS = new Set([
  'telekinetic-fling', 'telekinetic-crush', 'psionic-blast', 'thought-form',
  'ego-whip', 'life-siphon', 'bleeding-darkness', 'ectoplasmic-trail',
  'life-inversion-field', 'summon-astral-entity',
  'intellect-fortress', 'raulothims-psychic-lance', 'tashas-mind-whip',
  'psychic-scream',
]);

const classifySource = s => UA_SPELL_IDS.has(s.id) ? 'ua' : 'srd';

const pq = v => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  // If string contains real newlines/tabs, use Postgres E'...' notation with escapes
  if (s.includes('\n') || s.includes('\t') || s.includes('\\')) {
    s = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/'/g, "''");
    return `E'${s}'`;
  }
  return `'${s.replace(/'/g, "''")}'`;
};
const pqArray = arr => {
  if (!arr?.length) return "'{}'";
  const inner = arr.map(s => `"${String(s).replace(/"/g, '\\"').replace(/'/g, "''")}"`).join(',');
  return `'{${inner}}'`;
};
const pqJsonb = obj => obj ? `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb` : 'NULL';

const cols = [
  'id', 'name', 'owner_id', 'source', 'visibility',
  'level', 'school', 'casting_time', '"range"', 'components', 'duration',
  'concentration', 'ritual', 'classes', 'description', 'higher_levels',
  'save_type', 'attack_type', 'damage_dice', 'damage_type',
  'damage_at_slot_level', 'damage_at_char_level',
  'heal_dice', 'heal_at_slot_level', 'area_of_effect',
];

function spellToValues(s) {
  return '(' + [
    pq(s.id), pq(s.name), 'NULL', pq(classifySource(s)), "'private'",
    pq(s.level), pq(s.school), pq(s.casting_time ?? '1 action'),
    pq(s.range ?? 'Self'), pq(s.components ?? 'V, S'), pq(s.duration ?? 'Instantaneous'),
    pq(!!s.concentration), pq(!!s.ritual), pqArray(s.classes),
    pq(s.description ?? ''), pq(s.higher_levels),
    pq(s.save_type), pq(s.attack_type), pq(s.damage_dice), pq(s.damage_type),
    pqJsonb(s.damage_at_slot_level), pqJsonb(s.damage_at_char_level),
    pq(s.heal_dice), pqJsonb(s.heal_at_slot_level), pqJsonb(s.area_of_effect),
  ].join(', ') + ')';
}

const CHUNK_SIZE = 50;
const chunks = [];
for (let i = 0; i < SPELLS.length; i += CHUNK_SIZE) {
  chunks.push(SPELLS.slice(i, i + CHUNK_SIZE));
}

console.error(`Splitting ${SPELLS.length} spells into ${chunks.length} chunks of ~${CHUNK_SIZE}`);

chunks.forEach((chunk, idx) => {
  const sql = `INSERT INTO public.spells (${cols.join(', ')}) VALUES\n` +
    chunk.map(spellToValues).join(',\n') +
    '\nON CONFLICT (id) DO NOTHING;';
  const path = `/tmp/spell_seed_chunk_${String(idx + 1).padStart(2, '0')}.sql`;
  writeFileSync(path, sql);
  console.error(`  Chunk ${idx + 1}: ${chunk.length} spells, ${sql.length} chars → ${path}`);
});
