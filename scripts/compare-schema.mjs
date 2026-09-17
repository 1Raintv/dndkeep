// Compare data-free schema-inventory.sql exports. Never generates migration SQL.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function compareSchema(left, right) {
  function index(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Empty or invalid schema inventory');
    const result = new Map();
    for (const row of rows) {
      if (!row || typeof row.kind !== 'string' || !row.kind || typeof row.name !== 'string' ||
          !row.name || !/^[a-f0-9]{32}$/.test(row.fingerprint)) throw new Error('Invalid inventory row');
      const key = `${row.kind}:${row.name}`;
      if (result.has(key)) throw new Error(`Duplicate inventory object: ${key}`);
      result.set(key, row.fingerprint);
    }
    return result;
  }
  const a = index(left), b = index(right);
  return [...new Set([...a.keys(), ...b.keys()])].sort()
    .filter(key => a.get(key) !== b.get(key))
    .map(key => ({ key, status: !a.has(key) ? 'right-only' : !b.has(key) ? 'left-only' : 'changed' }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/compare-schema.mjs left.json right.json');
    const diff = compareSchema(...process.argv.slice(2).map(file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))));
    console.log(JSON.stringify(diff, null, 2));
    process.exitCode = diff.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
