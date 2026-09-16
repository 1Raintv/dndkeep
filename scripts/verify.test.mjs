import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the actual runner with fake tools: no DB, builds or source mutations.
function fixture({ types = '', typeExit = 0, lint = '[{"messages":[]}]', lintExit = 0, ruleExit = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dndkeep-gate-'));
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    put('scripts/verify.mjs', readFileSync(new URL('./verify.mjs', import.meta.url)));
    put('scripts/verify.test.mjs', '');
    put('.github/workflows/ci.yml', 'env:\n  TS_BASELINE: 1\n');
    put('node_modules/typescript/bin/tsc', `console.log(${JSON.stringify(types)}); process.exit(${typeExit});`);
    put('node_modules/eslint/bin/eslint.js', `console.log(${JSON.stringify(lint)}); process.exit(${lintExit});`);
    for (const path of ['scripts/coords-tests.mjs', 'scripts/anchor-check.mjs',
      'node_modules/vitest/vitest.mjs', 'scripts/sync-sw-version.mjs',
      'node_modules/vite/bin/vite.js', 'scripts/bundle-budget.mjs']) put(path, '');
    put('scripts/raw-regression.mjs', `process.exit(${ruleExit});`);
    return spawnSync(process.execPath, [join(root, 'scripts/verify.mjs')], { encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts carried type and style debt', () => {
  assert.equal(fixture({ types: 'a.ts(1,1): error TS2322: existing debt', typeExit: 2,
    lint: '[{"messages":[{"ruleId":"@typescript-eslint/no-unused-vars"}]}]', lintExit: 1 }).status, 0);
});
test('rejects checker crashes, invalid reports and empty lint coverage', () => {
  for (const options of [{ typeExit: 1 }, { lintExit: 2 }, { lint: 'invalid' }, { lint: '[]' }]) {
    assert.equal(fixture(options).status, 1);
  }
});
test('rejects missing names and errors above the baseline', () => {
  for (const types of ['error TS2304: missing name', 'error TS2322: first\nerror TS2322: second']) {
    assert.equal(fixture({ types, typeExit: 2 }).status, 1);
  }
});
test('rejects hook violations and parser failures', () => {
  for (const message of [{ ruleId: 'react-hooks/rules-of-hooks', message: 'bad hook' }, { fatal: true, message: 'parse failed' }]) {
    assert.equal(fixture({ lint: JSON.stringify([{ filePath: 'a.tsx', messages: [message] }]), lintExit: 1 }).status, 1);
  }
});
test('propagates a downstream suite failure', () => {
  assert.equal(fixture({ ruleExit: 1 }).status, 1);
});
