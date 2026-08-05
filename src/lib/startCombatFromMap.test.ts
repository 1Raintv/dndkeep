/**
 * startCombatFromMapTokens inversion proof (audit 4.6 slice 3): before
 * v2.646 this module read the UI store singleton at module scope and was
 * untestable outside a browser React tree. Now the map snapshot is
 * injected — these tests run with the store never imported at all.
 * Unit rule: no database; supabase is mocked at the module boundary.
 */
import { describe, it, expect, vi } from 'vitest';
import { startCombatFromMapTokens } from './startCombatFromMap';
import type { Token } from './map/mapTypes';

vi.mock('./supabase', () => ({ supabase: {} }));

const tok = (id: string, sceneId: string | null, over: Partial<Token> = {}) =>
  ({ id, sceneId, characterId: null, creatureId: null, ...over }) as Token;

describe('startCombatFromMapTokens (injected snapshot)', () => {
  it('mounted scene with zero matching tokens → no_tokens, no DB touched', async () => {
    const r = await startCombatFromMapTokens('camp1', { sceneId: 's1', tokens: [] });
    expect(r).toEqual({ ok: false, reason: 'no_tokens' });
  });

  it('tokens from OTHER scenes are filtered out (viewed scene wins)', async () => {
    const r = await startCombatFromMapTokens('camp1', {
      sceneId: 's1',
      tokens: [tok('t1', 'other-scene'), tok('t2', null)],
    });
    expect(r).toEqual({ ok: false, reason: 'no_tokens' });
  });
});
