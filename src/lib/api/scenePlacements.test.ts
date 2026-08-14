// v2.663.0 — guards the enumerated SELECT in scenePlacements.
//
// This exists because of a real, silent failure. v2.663 added
// `light_radius_ft` end to end — migration, Token type, row mapper,
// writer, context-menu UI — and the feature still did nothing, because
// `listPlacements` fetches an explicit column list and the new column
// was not in it. The mapper's `?? 0` fallback turned the missing field
// into a plausible-looking "carries no light", so there was no error,
// no type failure, and no failing unit test. It surfaced only by
// driving the running app and noticing a torch lit nothing.
//
// The module imports lib/supabase at module scope, so it gets vi.mock'd
// per the CLAUDE.md rule — unit tests never touch a database.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ data: [], error: null }) }) }) }) },
}));

const { PLACEMENT_SELECT } = await import('./scenePlacements');

describe('PLACEMENT_SELECT', () => {
  // Every column dbRowToPlacementToken reads off the placement row. If
  // you add a `row.foo` read there, add 'foo' here — that is the whole
  // point of this test.
  const READ_BY_MAPPER = [
    'id', 'scene_id', 'combatant_id', 'x', 'y', 'rotation', 'z_index',
    'size_override', 'color_override', 'image_storage_path_override',
    'visible_to_all', 'light_radius_ft', 'light_color',
  ];

  it.each(READ_BY_MAPPER)('fetches %s', (col) => {
    // Match the bare column name, not a substring of another column —
    // 'x' must not be satisfied by 'image_storage_path_override'.
    const columns = PLACEMENT_SELECT
      .replace(/combatants:[\s\S]*$/, '')   // drop the joined sub-select
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    expect(columns).toContain(col);
  });

  it('still joins the combatant fields the mapper needs', () => {
    for (const f of ['name', 'owner_id', 'definition_type', 'definition_id']) {
      expect(PLACEMENT_SELECT).toContain(f);
    }
  });
});
