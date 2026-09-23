/**
 * startCombatFromMapTokens inversion proof (audit 4.6 slice 3): before
 * v2.646 this module read the UI store singleton at module scope and was
 * untestable outside a browser React tree. Now the map snapshot is
 * injected — these tests run with the store never imported at all.
 * Unit rule: no database; supabase is mocked at the module boundary.
 *
 * v2.746 — per-instance seeding: one creature seed per TOKEN carrying its
 * combatantId, characters still one per character, legacy (no
 * combatantId) tokens keep the one-per-definition dedupe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startCombatFromMapTokens } from './startCombatFromMap';
import { startEncounter, type SeedSource } from './combatEncounter';
import type { Token } from './map/mapTypes';

const h = vi.hoisted(() => {
  const state = { rows: {} as Record<string, unknown[]> };
  function builder(table: string): unknown {
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve({ data: state.rows[table] ?? [], error: null }).then(res, rej);
        }
        return () => b;
      },
    });
    return b;
  }
  return { state, supabase: { from: (t: string) => builder(t) } };
});
vi.mock('./supabase', () => ({ supabase: h.supabase }));
vi.mock('./combatEncounter', async (orig) => ({
  ...(await orig<typeof import('./combatEncounter')>()),
  startEncounter: vi.fn(async () => ({ encounter: { id: 'enc' }, participants: [] })),
}));

const tok = (id: string, sceneId: string | null, over: Partial<Token> = {}) =>
  ({ id, sceneId, name: '', characterId: null, creatureId: null, combatantId: null, ...over }) as Token;

const goblinDef = { id: 'gob', name: 'Goblin Scout', ac: 13, hp: 7, max_hp: 7, dex: 14, speed: 30, visible_to_players: true };
const seedsOf = () => {
  const calls = vi.mocked(startEncounter).mock.calls;
  return (calls[calls.length - 1]?.[0].seeds ?? []) as SeedSource[];
};

beforeEach(() => { vi.mocked(startEncounter).mockClear(); h.state.rows = {}; });

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

describe('v2.746 per-instance seeds', () => {
  it('three placements sharing one definition → three seeds, each with its own combatantId and token name', async () => {
    h.state.rows = { homebrew_monsters: [goblinDef] };
    const r = await startCombatFromMapTokens('camp1', { sceneId: 's1', tokens: [
      tok('t1', 's1', { creatureId: 'gob', combatantId: 'cb1', name: 'Goblin Scout' }),
      tok('t2', 's1', { creatureId: 'gob', combatantId: 'cb2', name: 'Goblin Scout (archer)' }),
      tok('t3', 's1', { creatureId: 'gob', combatantId: 'cb3', name: '' }),
    ] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.participantCount).toBe(3);
    const seeds = seedsOf();
    expect(seeds.map(s => s.combatantId).sort()).toEqual(['cb1', 'cb2', 'cb3']);
    expect(seeds.every(s => s.entityId === 'gob')).toBe(true);
    expect(seeds.find(s => s.combatantId === 'cb2')?.name).toBe('Goblin Scout (archer)');
    expect(seeds.find(s => s.combatantId === 'cb3')?.name).toBe('Goblin Scout'); // blank token name → definition name
  });

  it('two tokens for one character → one character seed', async () => {
    h.state.rows = { characters: [{ id: 'pc', name: 'Nyx', dexterity: 12, armor_class: 15, current_hp: 10, max_hp: 10 }] };
    const r = await startCombatFromMapTokens('camp1', { sceneId: 's1', tokens: [
      tok('t1', 's1', { characterId: 'pc', combatantId: 'cbA' }),
      tok('t2', 's1', { characterId: 'pc', combatantId: 'cbB' }),
    ] });
    expect(r.ok).toBe(true);
    const seeds = seedsOf();
    expect(seeds.length).toBe(1);
    expect(seeds[0].type).toBe('character');
    expect(seeds[0].entityId).toBe('pc');
  });

  it('legacy tokens without combatantId sharing a definition → one seed (unchanged dedupe)', async () => {
    h.state.rows = { homebrew_monsters: [goblinDef] };
    const r = await startCombatFromMapTokens('camp1', { sceneId: 's1', tokens: [
      tok('t1', 's1', { creatureId: 'gob' }),
      tok('t2', 's1', { creatureId: 'gob' }),
    ] });
    expect(r.ok).toBe(true);
    const seeds = seedsOf();
    expect(seeds.length).toBe(1);
    expect(seeds[0].combatantId).toBeUndefined();
  });
});
