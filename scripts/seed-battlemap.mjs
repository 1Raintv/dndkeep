// v2.647 — Local battle-map fixture runner.
//
//   node scripts/seed-battlemap.mjs
//
// Two steps, both LOCAL-ONLY and both idempotent:
//   1. pipes supabase/seed/battlemap-fixture.sql into the local Docker
//      Postgres (`docker exec supabase_db_dndkeep psql`, the same
//      channel e2e/db/combat.spec.ts uses)
//   2. generates the fixture's images — a scene background and a few
//      token portraits — and uploads them to the local storage bucket,
//      then points the seeded rows at them
//
// It refuses to run unless .env.local points at 127.0.0.1/localhost, so
// it can never touch the production project (`.env`). Re-run it any time,
// and after every `npx supabase db reset`.
//
// The images are generated here rather than committed because they are
// throwaway test art: flat rectangles and discs, a few KB of zlib, and
// no binaries in git.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = 'supabase_db_dndkeep';
const BUCKET = 'battlemap-assets';
const FIXTURE_SCENE = 'Ruined Keep (fixture)';

// Standard supabase-local demo service key (not a secret — it is the
// same value `npx supabase status` prints on every machine). Only ever
// sent to the 127.0.0.1 stack; the local-URL guard below enforces that.
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// ── guard: local stack only ─────────────────────────────────────────
function localSupabaseUrl() {
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) return null;
  const m = readFileSync(p, 'utf-8').match(/^VITE_SUPABASE_URL=(.+)$/m);
  return m ? m[1].trim() : null;
}

const SUPABASE_URL = localSupabaseUrl();
if (!SUPABASE_URL || !/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) {
  console.error(
    `refusing to seed: .env.local is ${SUPABASE_URL ? `non-local (${SUPABASE_URL})` : 'absent'}.\n` +
    'This script only ever writes to the local Docker stack. See docs/LOCAL_DEV.md.',
  );
  process.exit(1);
}

// ── psql helpers ────────────────────────────────────────────────────
const psql = (args, input) =>
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

const query = (sql) => psql(['-t', '-A', '-c', sql]).trim();

// ── step 1: schema-level fixture ────────────────────────────────────
console.log('› applying supabase/seed/battlemap-fixture.sql …');
const sqlFile = readFileSync(join(ROOT, 'supabase', 'seed', 'battlemap-fixture.sql'), 'utf-8');
try {
  psql(['-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], sqlFile);
} catch (err) {
  console.error(err.stdout || '');
  console.error(err.stderr || '');
  console.error('fixture SQL failed. Is the local stack up? (npx supabase start)');
  process.exit(1);
}

// ── minimal PNG encoder (no deps) ───────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixel buffer → PNG bytes (8-bit truecolour+alpha, filter 0). */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── tiny raster canvas ──────────────────────────────────────────────
function canvas(w, h, [r, g, b, a = 255]) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([r, g, b, a], i * 4);
  return {
    w, h, px,
    rect(x0, y0, x1, y1, [cr, cg, cb, ca = 255]) {
      for (let y = Math.max(0, y0 | 0); y < Math.min(h, y1 | 0); y++) {
        for (let x = Math.max(0, x0 | 0); x < Math.min(w, x1 | 0); x++) {
          this.px.set([cr, cg, cb, ca], (y * w + x) * 4);
        }
      }
    },
    disc(cx, cy, rad, [cr, cg, cb, ca = 255]) {
      for (let y = Math.max(0, (cy - rad) | 0); y < Math.min(h, (cy + rad + 1) | 0); y++) {
        for (let x = Math.max(0, (cx - rad) | 0); x < Math.min(w, (cx + rad + 1) | 0); x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= rad) this.px.set([cr, cg, cb, ca], (y * w + x) * 4);
        }
      }
    },
    toPng() { return encodePng(w, h, this.px); },
  };
}

// Deterministic pseudo-random so re-runs produce byte-identical files
// (a changed background would otherwise bust the browser cache for no
// reason on every seed).
let seed = 0x2f6e2b1;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);

// ── the fixture's background: the dungeon floorplan, half-scale ─────
// The scene is 30x20 cells at 70px; drawing at 35px/cell keeps the file
// small and the BackgroundLayer stretches it to the world anyway.
function buildBackground() {
  const S = 35;
  const img = canvas(30 * S, 20 * S, [18, 20, 27]);
  const floor = (c0, r0, c1, r1) => {
    img.rect(c0 * S, r0 * S, c1 * S, r1 * S, [44, 48, 60]);
    // flagstone speckle
    for (let i = 0; i < (c1 - c0) * (r1 - r0) * 4; i++) {
      const x = (c0 + rand() * (c1 - c0)) * S;
      const y = (r0 + rand() * (r1 - r0)) * S;
      const v = 38 + Math.floor(rand() * 22);
      img.rect(x, y, x + 3, y + 3, [v, v + 3, v + 10]);
    }
  };
  floor(1, 1, 10, 9);    // guard room
  floor(16, 1, 28, 9);   // barracks
  floor(10, 4, 16, 5);   // east-west corridor
  floor(12, 5, 13, 12);  // south branch
  floor(6, 12, 21, 19);  // crypt
  // crypt has a darker sarcophagus aisle so the interior wall reads
  img.rect(16 * S, 14 * S, 17 * S, 18 * S, [30, 32, 42]);
  return img.toPng();
}

// ── token portraits: flat discs, enough to prove the sprite path ────
function buildPortrait(ring, core) {
  const img = canvas(160, 160, [0, 0, 0, 0]);
  img.disc(80, 80, 78, ring);
  img.disc(80, 80, 64, core);
  img.disc(62, 62, 18, [255, 255, 255, 40]); // highlight
  return img.toPng();
}

const ASSETS = [
  { path: 'fixture/ruined-keep-bg.png', bytes: buildBackground() },
  { path: 'fixture/portrait-dragon.png', bytes: buildPortrait([120, 20, 20, 255], [220, 68, 40, 255]) },
  { path: 'fixture/portrait-ogre.png', bytes: buildPortrait([70, 50, 20, 255], [176, 132, 62, 255]) },
  { path: 'fixture/portrait-rogue.png', bytes: buildPortrait([20, 40, 90, 255], [96, 165, 250, 255]) },
];

// ── step 2: upload + point the rows at the files ────────────────────
console.log('› uploading fixture art to local storage …');
let uploaded = 0;
for (const a of ASSETS) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${a.path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: a.bytes,
  });
  if (!res.ok) {
    console.warn(`  ! ${a.path} → ${res.status} ${await res.text()}`);
    continue;
  }
  uploaded++;
}

if (uploaded === ASSETS.length) {
  // scene_tokens is the only write target: the v2.389 trigger mirrors
  // image_storage_path onto scene_token_placements, so both engines
  // (use_combatants_for_battlemap on/off) show the portraits.
  const inFixtureScenes = `scene_id in (select id from scenes where name = '${FIXTURE_SCENE}')`;
  query(`update scenes set background_storage_path = 'fixture/ruined-keep-bg.png' where name = '${FIXTURE_SCENE}'`);
  query(`update scene_tokens set image_storage_path = 'fixture/portrait-dragon.png' where ${inFixtureScenes} and name = 'Young Red Dragon'`);
  query(`update scene_tokens set image_storage_path = 'fixture/portrait-ogre.png'   where ${inFixtureScenes} and name = 'Ogre Bruiser'`);
  query(`update scene_tokens set image_storage_path = 'fixture/portrait-rogue.png'  where ${inFixtureScenes} and name = 'Nyx Quickfingers'`);
}

// ── summary ─────────────────────────────────────────────────────────
const rows = query(`
  select c.name,
         (select count(*) from scenes s where s.campaign_id = c.id and s.name like '%(fixture%'),
         (select count(*) from scene_tokens t join scenes s on s.id = t.scene_id where s.campaign_id = c.id and s.name like '%(fixture%'),
         (select count(*) from scene_walls w join scenes s on s.id = w.scene_id where s.campaign_id = c.id and s.name like '%(fixture%'),
         (select count(*) from homebrew_monsters hm where hm.campaign_id = c.id)
    from campaigns c
   where c.name not like 'E2E %'
   order by c.created_at
`);

console.log('\n  campaign                     scenes  tokens  walls  creatures');
for (const line of rows.split('\n').filter(Boolean)) {
  const [name, scenes, tokens, walls, creatures] = line.split('|');
  console.log(
    `  ${name.padEnd(28)} ${scenes.padStart(6)}  ${tokens.padStart(6)}  ${walls.padStart(5)}  ${creatures.padStart(9)}`,
  );
}
console.log(`\n  storage: ${uploaded}/${ASSETS.length} fixture images uploaded`);
console.log('\ndone. Sign in as test-dm@dndkeep.local (DM) or test-player@dndkeep.local (player),');
console.log('password dndkeep-local-test, and open the campaign\'s Battle Map tab.');
