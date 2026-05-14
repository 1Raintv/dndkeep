// v2.498.0 — Typed cast helper for writes to jsonb columns.
//
// Background:
//   supabase-js's generated types model jsonb columns as the recursive
//   `Json` union type:
//     type Json =
//       | string | number | boolean | null
//       | { [key: string]: Json | undefined }
//       | Json[];
//
//   This union represents any valid JSON value. The problem is that
//   TypeScript can't *narrow* a strongly-typed object (e.g. a
//   `DrawShape[]`, `WallSegment[]`, `InventoryItem[]`,
//   `AutomationSettings`, `LairActionEntry[]`) to this union
//   automatically, even when the object IS valid JSON. Why: a typed
//   object's keys are nominal (`DrawShape.kind` etc.) while `Json`'s
//   inner record uses a string index signature; the two shapes are
//   not assignable in TS's structural-type machinery.
//
//   Pre-v2.498 the codebase worked around this with one of two
//   patterns at the call site:
//     1. `(supabase as any).from('x').update({ col: typed })` —
//        60+ sites; cheap but very loose, masks unrelated bugs.
//     2. `as unknown as Json` — narrower, but still hand-rolled at
//        every site and easy to copy-paste wrong.
//
//   v2.498 centralizes the cast in one helper so:
//     - The cast is named, searchable, and grep-able as a known
//       intentional escape hatch (not a sign of someone giving up
//       on types).
//     - The cast is contained to the jsonb-write surface — doesn't
//       leak into surrounding code via `(supabase as any)`.
//     - Future codemods to drop these casts (when supabase-js
//       eventually accepts arbitrary objects on jsonb writes) become
//       a single find-and-replace on `asJsonb(`.
//
// Usage:
//   await supabase.from('battle_maps').update({ drawings: asJsonb(next) });
//
// Why not generic `as Json`:
//   Same end result type-wise, but `asJsonb(value)` documents
//   *intent* at the call site (this is a jsonb column, the cast is
//   load-bearing) and gives us a stable hook for static-analysis
//   tooling later.

import type { Json } from '../types/supabase';

/** Cast a typed value into the recursive Json union for writes to a
 *  jsonb column. The value MUST be JSON-serializable — undefined
 *  fields, functions, symbols, and BigInt will not survive the round
 *  trip. This helper does not validate that constraint; it's a type
 *  shim, not a runtime check.
 *
 *  Common targets: any column declared `jsonb` in the schema, e.g.:
 *    - battle_maps.drawings, .walls, .tokens
 *    - characters.inventory, .active_buffs, .active_immunities,
 *      .death_saves, .currency, .equipped, .resources
 *    - campaigns.automation_settings
 *    - homebrew_monsters.lair_actions
 *    - any *_settings or *_state column in the schema
 */
export function asJsonb<T>(value: T): Json {
  return value as unknown as Json;
}
