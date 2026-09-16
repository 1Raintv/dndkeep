// One gate for local development and CI. Carried type/style debt is allowed;
// a crashed checker must never be mistaken for zero diagnostics.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(label, script, args = [], capture = false) {
  console.log(`\nChecking ${label}...`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status === null) {
    throw new Error(`${label} could not finish: ${result.error?.message ?? result.signal}`);
  }
  return result;
}
function requireSuccess(label, result) {
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status}).`);
}

try {
  requireSuccess('gate runner tests', run('gate runner tests', '--test', ['scripts/verify.test.mjs']));
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const baseline = workflow.match(/^\s*TS_BASELINE:\s*(\d+)\s*$/m);
  if (!baseline) throw new Error('Missing TS_BASELINE in CI workflow.');
  const types = run('TypeScript baseline', 'node_modules/typescript/bin/tsc', ['--noEmit'], true);
  const output = types.stdout + types.stderr;
  const diagnostics = output.match(/error TS\d+:/g) ?? [];
  console.log(`TypeScript: ${diagnostics.length}/${baseline[1]} errors allowed.`);
  if ((types.status !== 0 && diagnostics.length === 0) ||
      types.status > 2 || diagnostics.includes('error TS2304:') ||
      diagnostics.length > Number(baseline[1])) {
    console.error(output);
    throw new Error('TypeScript gate failed.');
  }

  const lint = run('React hooks', 'node_modules/eslint/bin/eslint.js', ['src', '--format', 'json'], true);
  if (lint.status > 1) throw new Error(`ESLint failed to run: ${lint.stderr || lint.stdout}`);
  const reports = JSON.parse(lint.stdout);
  if (!Array.isArray(reports) || reports.length === 0) throw new Error('ESLint returned no file reports.');
  const blockers = reports.flatMap(report => report.messages
    .filter(message => message.fatal || message.ruleId === 'react-hooks/rules-of-hooks')
    .map(message => `${report.filePath}:${message.line}: ${message.message}`));
  if (blockers.length) throw new Error(blockers.join('\n'));
  console.log('React hooks: clean (existing style debt excluded).');

  for (const [label, script, args] of [
    ['RAW regression', 'scripts/raw-regression.mjs', []],
    ['coordinates', 'scripts/coords-tests.mjs', []],
    ['anchors', 'scripts/anchor-check.mjs', []],
    ['unit tests', 'node_modules/vitest/vitest.mjs', ['run']],
    ['service-worker version', 'scripts/sync-sw-version.mjs', []],
    ['production build', 'node_modules/vite/bin/vite.js', ['build']],
    ['bundle budget', 'scripts/bundle-budget.mjs', []],
  ]) requireSuccess(label, run(label, script, args));
  console.log('\nVerification passed. This does not certify live auth, multiplayer, or production configuration.');
} catch (error) {
  console.error(`\nVerification failed: ${error.message}`);
  process.exitCode = 1;
}
