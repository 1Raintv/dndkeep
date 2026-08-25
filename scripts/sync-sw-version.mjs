#!/usr/bin/env node
// v2.683.0 — Keep public/sw.js's CACHE_NAME in step with src/version.ts.
//
// WHY THIS EXISTS. The service worker's cache name is the update mechanism:
// `activate` deletes every cache whose key !== CACHE_NAME, so a build that
// ships an unchanged CACHE_NAME leaves every returning visitor on the shell
// they already had. New code deploys, nobody sees it.
//
// Until now the only thing that rewrote it was a PowerShell one-liner inside
// deploy.bat (line ~154). That works if and only if every deploy goes through
// deploy.bat — and deploys do not. Vercel builds from any push to main, so a
// `git push` ships a build with a stale cache name and silently no-ops the
// update for every user. That is exactly what happened across v2.680–v2.682:
// version.ts reached 2.682.0 while sw.js sat at 2.651.0.
//
// Running as `prebuild` makes the sync a property of building rather than a
// property of remembering. deploy.bat's own rewrite is now redundant but
// harmless — it computes the same value from the same source.
//
// Audit item 3.4 / docs/MVP_LAUNCH.md Phase 4 item 4.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = resolve(root, 'src/version.ts');
const swFile = resolve(root, 'public/sw.js');

const versionSrc = readFileSync(versionFile, 'utf8');
const match = versionSrc.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
if (!match) {
  console.error(`sync-sw-version: could not find APP_VERSION in ${versionFile}`);
  process.exit(1);
}
const version = match[1];

const swSrc = readFileSync(swFile, 'utf8');
const CACHE_RE = /dndkeep-v[0-9][0-9.]*/;
const current = swSrc.match(CACHE_RE)?.[0];
if (!current) {
  console.error(`sync-sw-version: could not find a dndkeep-v* CACHE_NAME in ${swFile}`);
  process.exit(1);
}

const wanted = `dndkeep-v${version}`;
if (current === wanted) {
  console.log(`sync-sw-version: ok  ${wanted}`);
  process.exit(0);
}

// Replace every occurrence, not just the first — the cache name appears once
// today, but a second reference added later must not be left behind pointing at
// a cache that activate() has just deleted.
writeFileSync(swFile, swSrc.replace(new RegExp(CACHE_RE.source, 'g'), wanted));
console.log(`sync-sw-version: ${current} -> ${wanted}`);
