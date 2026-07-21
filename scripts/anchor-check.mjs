// v2.619.0 — Anchor-legality regression (open item #9, chat 18).
// Asserts every position-producing code path honors the v2.455
// size-parity anchor convention:
//   odd cell-count (1×1, 3×3):  token.x/y = CELL CENTER
//   even cell-count (2×2, 4×4): token.x/y = TOP-LEFT GRID INTERSECTION
// This is the bug class behind the mid-July wrong-attack-position
// debugging arc — four root causes, one of which was even-size tokens
// anchored at cell centers. This gate keeps it dead.
// Same zero-dependency esbuild pattern as coords-tests.mjs.

import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const tmp = mkdtempSync(join(tmpdir(), 'anchor-check-'));
const entry = join(tmp, 'entry.ts');
const out = join(tmp, 'bundle.mjs');
const root = process.cwd().replace(/\\/g, '/');

writeFileSync(entry, `
export { summonAnchorPx } from '${root}/src/lib/summonTokens';
export { isLegalAnchorPx } from '${root}/src/lib/battleMapGeometry';
export { tokenAnchorWorld, tokenSizeCells } from '${root}/src/lib/map/coords';
`);

buildSync({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '"http://localhost"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"anchor-check-stub"',
    'import.meta.env': '{}',
  },
});

const A = await import(pathToFileURL(out).href);

let failures = 0;
function ok(name, cond) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`); }
}

const grids = [50, 70];
const sizes = [
  ['medium', 1], ['large', 2], ['huge', 3], ['gargantuan', 4],
];
const cellsSamples = [[0, 0], [4, 4], [7, 3], [12, 19]];

console.log('— summon write path produces legal anchors —');
for (const gs of grids) {
  for (const [, cells] of sizes) {
    for (const [row, col] of cellsSamples) {
      const { x, y } = A.summonAnchorPx(row, col, cells, gs);
      ok(`summonAnchorPx(${row},${col}) cells=${cells} gs=${gs} legal`,
        A.isLegalAnchorPx(x, y, cells, gs));
    }
  }
}

console.log('— coords write path (tokenAnchorWorld) produces legal anchors —');
for (const gs of grids) {
  for (const [size, cells] of sizes) {
    for (const [row, col] of cellsSamples) {
      const { x, y } = A.tokenAnchorWorld(row, col, size, gs);
      ok(`tokenAnchorWorld(${row},${col},${size}) gs=${gs} legal`,
        A.isLegalAnchorPx(x, y, cells, gs));
    }
  }
}

console.log('— both paths agree on the same convention —');
for (const [size, cells] of sizes) {
  const a = A.summonAnchorPx(4, 4, cells, 70);
  const b = A.tokenAnchorWorld(4, 4, size, 70);
  ok(`summon vs coords agree for ${size}`, a.x === b.x && a.y === b.y);
}

console.log('— predicate rejects the failure modes —');
ok('even at cell center is ILLEGAL (the v2.550-arc bug)', !A.isLegalAnchorPx(315, 315, 2, 70));
ok('odd at intersection is ILLEGAL', !A.isLegalAnchorPx(280, 280, 1, 70));
ok('off-grid point is ILLEGAL', !A.isLegalAnchorPx(283, 291, 2, 70));
ok('zero grid size is ILLEGAL', !A.isLegalAnchorPx(0, 0, 1, 0));
ok('tokenSizeCells matches parity table', JSON.stringify(
  ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'].map(A.tokenSizeCells)
) === JSON.stringify([1, 1, 1, 2, 3, 4]));

if (failures > 0) {
  console.error(`\nanchor checks: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nanchor checks: ALL PASSED');
