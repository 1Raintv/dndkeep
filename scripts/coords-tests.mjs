// v2.567.0 — Track 0 step 4: unit tests for src/lib/map/coords.ts.
// These double as regression guards for BOTH renderers (Track 2 live map
// and the future Track 3 graphics map), since all grid↔world math is
// shared. Same zero-dependency esbuild pattern as raw-regression.mjs.

import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const tmp = mkdtempSync(join(tmpdir(), 'coords-tests-'));
const entry = join(tmp, 'entry.ts');
const out = join(tmp, 'bundle.mjs');
const root = process.cwd().replace(/\\/g, '/');

writeFileSync(entry, `
export * from '${root}/src/lib/map/coords';
export { tokenFootprintRange } from '${root}/src/lib/battleMapGeometry';
`);

buildSync({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '"http://localhost"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"coords-tests-stub"',
    'import.meta.env': '{}',
  },
});

const C = await import(pathToFileURL(out).href);

let failures = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} — got ${a}, expected ${e}`); }
}

const cell = 70; // matches test scene grid

console.log('— grid → world —');
eq('cellCenterWorld(0,0)', C.cellCenterWorld(0, 0, cell), { x: 35, y: 35 });
eq('cellCenterWorld(2,3)', C.cellCenterWorld(2, 3, cell), { x: 245, y: 175 });
eq('intersectionWorld(0,0)', C.intersectionWorld(0, 0, cell), { x: 0, y: 0 });
eq('intersectionWorld(2,3)', C.intersectionWorld(2, 3, cell), { x: 210, y: 140 });

console.log('— token anchor convention (odd=center, even=intersection) —');
eq('tokenAnchorWorld medium (1×1) = cell center', C.tokenAnchorWorld(4, 4, 'medium', cell), { x: 315, y: 315 });
eq('tokenAnchorWorld huge (3×3) = cell center', C.tokenAnchorWorld(4, 4, 'huge', cell), { x: 315, y: 315 });
eq('tokenAnchorWorld large (2×2) = intersection', C.tokenAnchorWorld(4, 4, 'large', cell), { x: 280, y: 280 });
eq('tokenAnchorWorld gargantuan (4×4) = intersection', C.tokenAnchorWorld(4, 4, 'gargantuan', cell), { x: 280, y: 280 });
eq('tokenSizeCells map', ['tiny','small','medium','large','huge','gargantuan'].map(C.tokenSizeCells), [1,1,1,2,3,4]);

console.log('— world → grid —');
eq('worldToCell(35,35)', C.worldToCell(35, 35, cell), { row: 0, col: 0 });
eq('worldToCell(70,70) lands in cell 1,1', C.worldToCell(70, 70, cell), { row: 1, col: 1 });
eq('worldToCell(69.9,69.9) stays in 0,0', C.worldToCell(69.9, 69.9, cell), { row: 0, col: 0 });

console.log('— snapping —');
eq('snapToCellCenter exact center is fixpoint', C.snapToCellCenter(105, 105, cell), { x: 105, y: 105 });
eq('snapToCellCenter pulls to nearest center', C.snapToCellCenter(80, 130, cell), { x: 105, y: 105 });
eq('snapTokenAnchor odd → cell center', C.snapTokenAnchor(80, 130, 'medium', cell), { x: 105, y: 105 });
eq('snapTokenAnchor even → intersection', C.snapTokenAnchor(80, 130, 'large', cell), { x: 70, y: 140 });
eq('snapTokenAnchor even at intersection is fixpoint', C.snapTokenAnchor(140, 140, 'gargantuan', cell), { x: 140, y: 140 });
// Round-trip: a snapped anchor re-snaps to itself for every size.
for (const size of ['medium','large','huge','gargantuan']) {
  const s1 = C.snapTokenAnchor(123, 456, size, cell);
  const s2 = C.snapTokenAnchor(s1.x, s1.y, size, cell);
  eq(`snap idempotent (${size})`, s2, s1);
}

console.log('— anchor ↔ footprint agreement with battleMapGeometry —');
{
  // Odd (3×3) token at row 4, col 4: anchor is the CENTER cell → footprint 3..5.
  const fpOdd = C.tokenFootprintRange({ row: 4, col: 4, size: 3 });
  eq('footprint odd 3×3 @ (4,4)', fpOdd, { rMin: 3, rMax: 5, cMin: 3, cMax: 5 });
  // Even (2×2) token at row 4, col 4: anchor is TOP-LEFT cell → footprint 4..5.
  const fpEven = C.tokenFootprintRange({ row: 4, col: 4, size: 2 });
  eq('footprint even 2×2 @ (4,4)', fpEven, { rMin: 4, rMax: 5, cMin: 4, cMax: 5 });
  // The even anchor's world position (intersection at row/col) must be the
  // top-left corner of the footprint's world AABB.
  const anchor = C.tokenAnchorWorld(4, 4, 'large', cell);
  const topLeft = C.intersectionWorld(fpEven.rMin, fpEven.cMin, cell);
  eq('even anchor == footprint AABB top-left', anchor, topLeft);
  // The odd anchor's world position must be the CENTER of the footprint AABB.
  const anchorOdd = C.tokenAnchorWorld(4, 4, 'huge', cell);
  const aabbCenter = {
    x: (C.intersectionWorld(fpOdd.rMin, fpOdd.cMin, cell).x + C.intersectionWorld(fpOdd.rMax + 1, fpOdd.cMax + 1, cell).x) / 2,
    y: (C.intersectionWorld(fpOdd.rMin, fpOdd.cMin, cell).y + C.intersectionWorld(fpOdd.rMax + 1, fpOdd.cMax + 1, cell).y) / 2,
  };
  eq('odd anchor == footprint AABB center', anchorOdd, aabbCenter);
}

console.log('— world ↔ screen —');
{
  const v = { offsetX: 120, offsetY: -40, scale: 1.5 };
  eq('worldToScreen', C.worldToScreen(100, 200, v), { x: 270, y: 260 });
  const w = C.screenToWorld(270, 260, v);
  eq('screenToWorld inverts', { x: Math.round(w.x), y: Math.round(w.y) }, { x: 100, y: 200 });
  // Round-trip at several scales including zoom-out.
  for (const scale of [0.25, 1, 2.75]) {
    const vt = { offsetX: -333, offsetY: 77, scale };
    const p = C.worldToScreen(41, 59, vt);
    const back = C.screenToWorld(p.x, p.y, vt);
    eq(`round-trip @ scale ${scale}`, { x: +back.x.toFixed(6), y: +back.y.toFixed(6) }, { x: 41, y: 59 });
  }
}

rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\ncoords tests: ALL PASSED' : `\ncoords tests: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
