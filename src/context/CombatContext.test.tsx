// @vitest-environment happy-dom
/**
 * useCombat() CONTRACT characterization (audit 4.6 prep).
 *
 * These tests pin the hook's consumer-visible behavior — load the active
 * encounter, normalize participants through the combatants join, derive
 * currentActor, expose refresh — against a mocked supabase. The state
 * move (context → store) must keep every assertion green with ZERO test
 * edits: the hook API is the contract, the carrier is an implementation
 * detail. Unit rule: no database — the mock below is the entire backend.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { CombatProvider, useCombat } from './CombatContext';

const subscriptions:Array<{config:{event:string;table:string;filter?:string};callback:(payload:{old:{id:string}})=>void}>=[];
let reads=0;
afterEach(cleanup);
const fixtures: { encounter: unknown; participants: unknown[] } = { encounter: null, participants: [] };

vi.mock('../lib/supabase', () => {
  const makeChain = () => {
    const self: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) self[m] = () => self;
    self.maybeSingle = async () => ({ data: fixtures.encounter });
    // PostgREST builders are thenables — the participants query awaits the chain itself.
    self.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: fixtures.participants }).then(resolve);
    return self;
  };
  return {
    supabase: {
      from: () => {reads++;return makeChain();},
      channel: () => { const ch: Record<string, unknown> = {}; ch.on = (_kind:unknown,config:typeof subscriptions[number]['config'],callback:typeof subscriptions[number]['callback']) => {subscriptions.push({config,callback});return ch;}; ch.subscribe = () => ch; return ch; },
      removeChannel: vi.fn(),
    },
  };
});

let seen: ReturnType<typeof useCombat> | null = null;
function Probe() {
  seen = useCombat();
  return null;
}

beforeEach(() => { seen = null; reads=0;subscriptions.length=0;fixtures.encounter = null; fixtures.participants = []; });

describe('useCombat contract', () => {
  it('no active encounter → null encounter, empty participants, null actor, loading resolves', async () => {
    render(<CombatProvider campaignId="c1"><Probe /></CombatProvider>);
    await waitFor(() => expect(seen?.loading).toBe(false));
    expect(seen?.encounter).toBeNull();
    expect(seen?.participants).toEqual([]);
    expect(seen?.currentActor).toBeNull();
    expect(typeof seen?.refresh).toBe('function');
  });

  it('active encounter: participants flow through the combatants join; currentActor honors index + death', async () => {
    fixtures.encounter = { id: 'enc1', status: 'active', current_turn_index: 1, campaign_id: 'c1' };
    fixtures.participants = [
      { id: 'p-dead', name: 'Fallen', turn_order: 0, combatant_id: 'cb0',
        combatants: { current_hp: 0, max_hp: 10, is_dead: true } },
      { id: 'p-a', name: 'Aria', turn_order: 1, combatant_id: 'cb1',
        combatants: { current_hp: 9, max_hp: 12, is_dead: false, active_conditions: ['prone'] } },
      { id: 'p-b', name: 'Borin', turn_order: 2, combatant_id: 'cb2',
        combatants: { current_hp: 3, max_hp: 15, is_dead: false } },
    ];
    render(<CombatProvider campaignId="c1"><Probe /></CombatProvider>);
    await waitFor(() => expect(seen?.loading).toBe(false));
    expect(seen?.encounter).toMatchObject({ id: 'enc1' });
    // Join flattened: HP reads come from combatants, not the participant row.
    const byName = Object.fromEntries((seen?.participants ?? []).map(p => [p.name, p]));
    expect(byName['Aria'].current_hp).toBe(9);
    expect(byName['Aria'].active_conditions).toEqual(['prone']);
    expect(byName['Borin'].current_hp).toBe(3);
    // index 1 over ALIVE-sorted [Aria, Borin] → Borin (Fallen excluded first).
    expect(seen?.currentActor?.name).toBe('Borin');
  });

  it('no campaignId → resolves to empty state without fetching', async () => {
    render(<CombatProvider campaignId={''}><Probe /></CombatProvider>);
    await waitFor(() => expect(seen?.loading).toBe(false));
    expect(seen?.encounter).toBeNull();
    expect(seen?.participants).toEqual([]);
  });
});

it('reloads deleted visible participants using their key, ignoring unrelated deletions',async()=>{
 fixtures.encounter={id:'enc',status:'active',campaign_id:'c1',current_turn_index:0};
 fixtures.participants=[{id:'visible',participant_type:'character',entity_id:'hero',combatant_id:'cb',combatants:{current_hp:10}}];
 render(<CombatProvider campaignId="c1"><Probe /></CombatProvider>);
 await waitFor(()=>expect(seen?.participants.length).toBe(1));
 const deletion=subscriptions.find(s=>s.config.table==='combat_participants'&&s.config.event==='DELETE');
 expect(deletion).toBeTruthy();expect(deletion?.config.filter).toBeUndefined();
 const before=reads;await act(async()=>deletion!.callback({old:{id:'unrelated'}}));expect(reads).toBe(before);
 fixtures.participants=[];await act(async()=>deletion!.callback({old:{id:'visible'}}));
 await waitFor(()=>expect(seen?.participants).toEqual([]));expect(reads).toBeGreaterThan(before);
});
