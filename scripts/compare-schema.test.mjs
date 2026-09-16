import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSchema } from './compare-schema.mjs';

const row = (name, fingerprint = 'a'.repeat(32)) => ({ kind: 'policy', name, fingerprint });
test('reports missing and changed objects without depending on export order', () => {
  assert.deepEqual(compareSchema([row('same'), row('gone'), row('changed')],
    [row('changed', 'b'.repeat(32)), row('new'), row('same')]), [
    { key: 'policy:changed', status: 'changed' },
    { key: 'policy:gone', status: 'left-only' },
    { key: 'policy:new', status: 'right-only' },
  ]);
  assert.deepEqual(compareSchema([row('a'), row('b')], [row('b'), row('a')]), []);
});
test('fails closed on empty, malformed and duplicate exports', () => {
  for (const bad of [[], {}, [null], [row('a', 'bad')], [row('a'), row('a')]]) {
    assert.throws(() => compareSchema(bad, [row('a')]));
    assert.throws(() => compareSchema([row('a')], bad));
  }
});
