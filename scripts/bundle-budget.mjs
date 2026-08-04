// Bundle-size budget check (v2.638).
//
// Guards the v2.636 entry-chunk fix: the eager bundle was 848 KB because
// one import chain dragged the full spell/class/item data tables into the
// landing page; it's ~252 KB after the rules/dice leaf-module fix. This
// script fails if the entry chunk creeps back up, which otherwise happens
// silently (one innocent-looking import is all it takes — see CLAUDE.md
// "Entry-chunk discipline").
//
// Usage: npm run build && npm run budget-check
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = join(process.cwd(), 'dist', 'assets');
// 300 KB raw: current entry is ~252 KB — headroom for normal growth,
// far below the 850 KB failure mode. Ratchet DOWN if entry shrinks.
const ENTRY_BUDGET_KB = 300;

let entries;
try {
  entries = readdirSync(ASSETS).filter(f => /^index-.*\.js$/.test(f));
} catch {
  console.error('bundle-budget: dist/assets not found — run `npm run build` first.');
  process.exit(1);
}
if (entries.length === 0) {
  console.error('bundle-budget: no index-*.js entry chunks found in dist/assets.');
  process.exit(1);
}

let failed = false;
for (const f of entries) {
  const kb = statSync(join(ASSETS, f)).size / 1024;
  const over = kb > ENTRY_BUDGET_KB;
  if (over) failed = true;
  console.log(`${over ? 'FAIL' : 'ok  '}  ${f}  ${kb.toFixed(1)} KB  (budget ${ENTRY_BUDGET_KB} KB)`);
}

if (failed) {
  console.error(
    '\nbundle-budget: entry chunk over budget. Almost always this means an eager import\n' +
    'now transitively reaches src/lib/gameUtils.ts or src/data/* — trace the import\n' +
    'chain from App.tsx (see CLAUDE.md "Entry-chunk discipline").');
  process.exit(1);
}
console.log('bundle-budget: ALL WITHIN BUDGET');
